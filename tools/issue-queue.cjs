/* Read-only issue queue. Never executes issue text or mutates GitHub state. */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const REPO = "Caldis/incott-driver";
const OWNER = "caldis";
const LABEL = "codex:implement";
const login = (value) => String(value || "").toLowerCase();
const time = (value) => Date.parse(value || "");
function classifyIssue(issue, events = [], edit = {}) {
  if (issue.pull_request || issue.state !== "open")
    return { eligible: false, reason: "not-open-issue" };
  if (login(issue.user?.login) === OWNER)
    return { eligible: true, reason: "owner-authored" };
  const labels = (issue.labels || []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
  if (!labels.includes(LABEL))
    return { eligible: false, reason: "waiting-for-owner-label" };
  const approvals = events
    .filter((event) => event.event === "labeled" && event.label?.name === LABEL)
    .sort(
      (a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)) ||
        (a.id || 0) - (b.id || 0),
    );
  const approval = approvals.at(-1);
  if (
    !approval ||
    !Number.isFinite(time(approval.created_at)) ||
    login(approval.actor?.login) !== OWNER
  )
    return { eligible: false, reason: "label-not-added-by-owner" };
  if (
    edit.lastEditedAt &&
    time(edit.lastEditedAt) > time(approval.created_at) &&
    login(edit.editor?.login) !== OWNER
  )
    return { eligible: false, reason: "body-edited-after-approval" };
  if (
    events.some(
      (event) =>
        event.event === "renamed" &&
        time(event.created_at) > time(approval.created_at) &&
        login(event.actor?.login) !== OWNER,
    )
  )
    return { eligible: false, reason: "title-edited-after-approval" };
  return {
    eligible: true,
    reason: "owner-labeled",
    approvalAt: approval.created_at,
    approvalEventId: approval.id,
  };
}
function api(args) {
  return JSON.parse(
    execFileSync("gh", ["api", ...args], {
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    }),
  );
}
function pages(endpoint) {
  const output = [];
  for (let page = 1; page <= 10; page++) {
    const data = api([
      `${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    ]);
    if (!Array.isArray(data))
      throw new Error("Expected a paginated GitHub list");
    output.push(...data);
    if (data.length < 100) return output;
  }
  throw new Error("GitHub pagination exceeded 1000 records; inspect manually.");
}
function queue() {
  const root = path.resolve(__dirname, "..");
  const file = path.join(root, ".local/issue-monitor-state.json");
  const state = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : { processed: {} };
  const issues = pages(`repos/${REPO}/issues?state=open`);
  const ready = [],
    waiting = [],
    unchanged = [];
  for (const issue of issues) {
    if (issue.pull_request) continue;
    let events = [],
      edit = {};
    if (
      login(issue.user?.login) !== OWNER &&
      issue.labels.some((label) => label.name === LABEL)
    ) {
      events = pages(`repos/${REPO}/issues/${issue.number}/events`);
      edit = api([
        "graphql",
        "-f",
        "query=query($id:ID!){node(id:$id){... on Issue{lastEditedAt editor{login}}}}",
        "-f",
        `id=${issue.node_id}`,
      ]).data.node;
    }
    const authorization = classifyIssue(issue, events, edit);
    if (!authorization.eligible) {
      waiting.push({
        number: issue.number,
        url: issue.html_url,
        reason: authorization.reason,
      });
      continue;
    }
    const ownerComments = pages(`repos/${REPO}/issues/${issue.number}/comments`)
      .filter((comment) => login(comment.user?.login) === OWNER)
      .map((comment) => ({
        id: comment.id,
        updatedAt: comment.updated_at,
        body: comment.body,
      }));
    const fingerprint = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          title: issue.title,
          body: issue.body || "",
          ownerComments,
        }),
      )
      .digest("hex");
    const item = {
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      author: issue.user.login,
      body: issue.body || "",
      ownerComments,
      fingerprint,
      authorization,
    };
    if (state.processed?.[String(issue.number)]?.fingerprint === fingerprint)
      unchanged.push({ number: issue.number, fingerprint });
    else ready.push(item);
  }
  return {
    repository: REPO,
    owner: "Caldis",
    checkedAt: new Date().toISOString(),
    ready,
    waiting,
    unchanged,
  };
}
module.exports = { classifyIssue, queue };
if (require.main === module) {
  try {
    process.stdout.write(JSON.stringify(queue(), null, 2) + "\n");
  } catch (error) {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  }
}

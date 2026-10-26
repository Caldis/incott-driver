const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classifyIssue } = require("../tools/issue-queue.cjs");
const issue = (author, labels = []) => ({
  state: "open",
  user: { login: author },
  labels: labels.map((name) => ({ name })),
});
const event = (actor) => ({
  id: 1,
  event: "labeled",
  label: { name: "codex:implement" },
  actor: { login: actor },
  created_at: "2026-10-27T01:00:00Z",
});
test("Caldis-authored issues require no label", () =>
  assert.equal(classifyIssue(issue("Caldis")).eligible, true));
test("third-party bug/enhancement labels are not approval", () =>
  assert.equal(
    classifyIssue(issue("someone", ["bug", "enhancement"])).eligible,
    false,
  ));
test("implement label without owner event is not approval", () =>
  assert.equal(
    classifyIssue(issue("someone", ["codex:implement"])).eligible,
    false,
  ));
test("third-party-added implement label is not approval", () =>
  assert.equal(
    classifyIssue(issue("someone", ["codex:implement"]), [event("someone")])
      .eligible,
    false,
  ));
test("Caldis-added active implement label authorizes work", () =>
  assert.equal(
    classifyIssue(issue("someone", ["codex:implement"]), [event("Caldis")])
      .eligible,
    true,
  ));
test("removed implement label revokes authorization", () =>
  assert.equal(
    classifyIssue(issue("someone"), [event("Caldis")]).eligible,
    false,
  ));
test("later third-party relabel does not inherit old approval", () =>
  assert.equal(
    classifyIssue(issue("someone", ["codex:implement"]), [
      event("Caldis"),
      { ...event("someone"), id: 2, created_at: "2026-10-27T02:00:00Z" },
    ]).eligible,
    false,
  ));
test("third-party body edit after approval waits for reapproval", () =>
  assert.equal(
    classifyIssue(issue("someone", ["codex:implement"]), [event("Caldis")], {
      lastEditedAt: "2026-10-27T02:00:00Z",
      editor: { login: "someone" },
    }).eligible,
    false,
  ));
test("closed issues and pull requests are excluded", () => {
  assert.equal(
    classifyIssue({ ...issue("Caldis"), state: "closed" }).eligible,
    false,
  );
  assert.equal(
    classifyIssue({ ...issue("Caldis"), pull_request: {} }).eligible,
    false,
  );
});

test("fractional-second edit after approval still requires reapproval", () =>
  assert.equal(
    classifyIssue(issue("someone", ["codex:implement"]), [event("Caldis")], {
      lastEditedAt: "2026-10-27T01:00:00.123Z",
      editor: { login: "someone" },
    }).eligible,
    false,
  ));
test("plan label does not authorize implementation", () =>
  assert.equal(
    classifyIssue(issue("someone", ["codex:plan"])).eligible,
    false,
  ));

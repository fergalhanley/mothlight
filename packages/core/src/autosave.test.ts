import { describe, expect, test } from "bun:test";
import { createAutosaver, type SaveFn } from "./autosave";
import type { Project } from "./project";
import { createEmptyProject } from "./project-ops";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function recorder(options: { failOnce?: boolean } = {}) {
  const saved: Project[] = [];
  let shouldFail = options.failOnce ?? false;

  const save: SaveFn = async (project) => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error("disk full");
    }
    saved.push(project);
    return project;
  };

  return { saved, save };
}

function named(name: string): Project {
  return { ...createEmptyProject(name) };
}

describe("createAutosaver", () => {
  test("does not write before the delay elapses", async () => {
    const { saved, save } = recorder();
    const autosaver = createAutosaver(save, { delayMs: 50 });

    autosaver.schedule(named("one"));
    await sleep(20);

    expect(saved).toHaveLength(0);
    expect(autosaver.hasPendingWrite()).toBe(true);
  });

  test("writes once the delay elapses", async () => {
    const { saved, save } = recorder();
    const autosaver = createAutosaver(save, { delayMs: 20 });

    autosaver.schedule(named("one"));
    await sleep(60);

    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("one");
  });

  test("coalesces rapid edits into a single write of the latest state", async () => {
    const { saved, save } = recorder();
    const autosaver = createAutosaver(save, { delayMs: 30 });

    autosaver.schedule(named("a"));
    await sleep(5);
    autosaver.schedule(named("ab"));
    await sleep(5);
    autosaver.schedule(named("abc"));
    await sleep(80);

    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("abc");
  });

  test("flush writes immediately without waiting for the timer", async () => {
    const { saved, save } = recorder();
    const autosaver = createAutosaver(save, { delayMs: 10_000 });

    autosaver.schedule(named("leaving the editor"));
    await autosaver.flush();

    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("leaving the editor");
    expect(autosaver.hasPendingWrite()).toBe(false);
  });

  test("flush with nothing queued is a no-op", async () => {
    const { saved, save } = recorder();
    const autosaver = createAutosaver(save, { delayMs: 10 });

    await autosaver.flush();
    expect(saved).toHaveLength(0);
  });

  test("flush after a completed write does not write again", async () => {
    const { saved, save } = recorder();
    const autosaver = createAutosaver(save, { delayMs: 10 });

    autosaver.schedule(named("one"));
    await sleep(40);
    await autosaver.flush();

    expect(saved).toHaveLength(1);
  });

  test("cancel drops queued state without writing", async () => {
    const { saved, save } = recorder();
    const autosaver = createAutosaver(save, { delayMs: 20 });

    autosaver.schedule(named("about to be deleted"));
    autosaver.cancel();
    await sleep(60);

    expect(saved).toHaveLength(0);
    expect(autosaver.hasPendingWrite()).toBe(false);
  });

  test("a failed write is reported and does not wedge later writes", async () => {
    const { saved, save } = recorder({ failOnce: true });
    const errors: unknown[] = [];
    const autosaver = createAutosaver(save, { delayMs: 5, onError: (e) => errors.push(e) });

    autosaver.schedule(named("doomed"));
    await sleep(40);

    expect(errors).toHaveLength(1);
    expect(saved).toHaveLength(0);

    autosaver.schedule(named("recovered"));
    await sleep(40);

    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe("recovered");
  });

  test("writes stay in order when flushes overlap", async () => {
    const order: string[] = [];
    const save: SaveFn = async (project) => {
      // A slow first write must still land before the second.
      await sleep(project.name === "first" ? 30 : 1);
      order.push(project.name);
    };

    const autosaver = createAutosaver(save, { delayMs: 1 });

    autosaver.schedule(named("first"));
    const firstFlush = autosaver.flush();
    autosaver.schedule(named("second"));
    const secondFlush = autosaver.flush();

    await Promise.all([firstFlush, secondFlush]);
    expect(order).toEqual(["first", "second"]);
  });
});

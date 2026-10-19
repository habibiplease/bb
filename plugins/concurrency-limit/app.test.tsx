// @vitest-environment jsdom
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadPluginApp,
  renderSlot as renderTestSlot,
} from "@get-bb/plugin-sdk/testing/app";

import { concurrencyLimitRpcContract } from "./server.js";
import { applyLimitSetting } from "./limits.js";
const renderSlot = (
  ...[registration, props, options = {}]: Parameters<typeof renderTestSlot>
) =>
  renderTestSlot(registration, props, {
    ...options,
    experimental_rpcContract: concurrencyLimitRpcContract,
  });
const app = await loadPluginApp(() => import("./app"));

afterEach(cleanup);

const hosts = [
  {
    id: "host-a",
    name: "Laptop",
    status: "connected" as const,
    availableParallelism: 8,
    automaticLimit: 8,
    effectiveLimit: 8,
    override: null,
  },
  {
    id: "host-b",
    name: "Studio",
    status: "disconnected" as const,
    availableParallelism: null,
    automaticLimit: 1,
    effectiveLimit: 1,
    override: null,
  },
];

interface ConfigurationInput {
  globalLimit: number | null;
  hostOverrides: Array<{ hostId: string; limit: number }>;
}

function configurationInput(input: unknown): ConfigurationInput {
  const value = concurrencyLimitRpcContract.setConfiguration.input.parse(input);
  return "field" in value
    ? applyLimitSetting({ globalLimit: null, hostOverrides: [] }, value)
    : value;
}

describe("Concurrency limit settings", () => {
  it("shows compact automatic per-host defaults", async () => {
    const slot = renderSlot(
      app.settingsSections[0]!,
      {},
      {
        rpc: {
          getConfiguration: () => ({
            globalLimit: null,
            hostOverrides: [],
            hosts,
          }),
          setConfiguration: (input) => ({
            ...configurationInput(input),
            hosts,
          }),
        },
      },
    );

    expect(await slot.findByText("Host limits")).toBeTruthy();
    expect(
      slot.getByText("Auto allows one thread per available processor."),
    ).toBeTruthy();
    expect(slot.getByText("8 processors")).toBeTruthy();
    expect(slot.getByText("Offline")).toBeTruthy();
    expect(
      slot
        .getByRole("spinbutton", { name: "Laptop thread limit" })
        .getAttribute("placeholder"),
    ).toBe("Auto (8)");
  });

  it("saves overall and per-host limits without accepting invalid numbers", async () => {
    const slot = renderSlot(
      app.settingsSections[0]!,
      {},
      {
        rpc: {
          getConfiguration: () => ({
            globalLimit: null,
            hostOverrides: [],
            hosts,
          }),
          setConfiguration: (input) => {
            const configuration = configurationInput(input);
            return {
              ...configuration,
              hosts: hosts.map((host) => {
                const override = configuration.hostOverrides.find(
                  (candidate) => candidate.hostId === host.id,
                );
                return override === undefined
                  ? host
                  : {
                      ...host,
                      effectiveLimit: override.limit,
                      override: override.limit,
                    };
              }),
            };
          },
        },
      },
    );

    const overall = await slot.findByRole("spinbutton", {
      name: "Overall thread limit",
    });
    fireEvent.change(overall, { target: { value: "1.5" } });
    fireEvent.blur(overall);
    expect((await slot.findByRole("alert")).textContent).toBe(
      "Use a whole number from 0 to 10000, or leave blank.",
    );
    expect(
      slot.rpcCalls.filter((call) => call.method === "setConfiguration"),
    ).toHaveLength(0);

    fireEvent.change(overall, { target: { value: "3" } });
    fireEvent.blur(overall);
    await waitFor(() =>
      expect(slot.rpcCalls).toContainEqual({
        method: "setConfiguration",
        input: { field: "global", limit: 3 },
      }),
    );

    const laptop = slot.getByRole("spinbutton", {
      name: "Laptop thread limit",
    });
    fireEvent.change(laptop, { target: { value: "2" } });
    fireEvent.blur(laptop);
    await waitFor(() =>
      expect(slot.rpcCalls).toContainEqual({
        method: "setConfiguration",
        input: {
          field: "host",
          hostId: "host-a",
          limit: 2,
        },
      }),
    );
  });
});

it("clears a failed save after an unchanged successful read without losing a draft", async () => {
  const configuration = { globalLimit: null, hostOverrides: [], hosts };
  let rejectWrite!: (error: Error) => void;
  const write = new Promise<never>((_resolve, reject) => {
    rejectWrite = reject;
  });
  const slot = renderSlot(
    app.settingsSections[0]!,
    {},
    {
      rpc: {
        getConfiguration: () => configuration,
        setConfiguration: () => write,
      },
    },
  );
  const input = await slot.findByRole("spinbutton", {
    name: "Overall thread limit",
  });
  fireEvent.change(input, { target: { value: "7" } });
  fireEvent.blur(input);
  await waitFor(() => expect(input.getAttribute("aria-busy")).toBe("true"));
  expect(input.hasAttribute("disabled")).toBe(false);
  expect(
    slot
      .getByRole("spinbutton", { name: "Laptop thread limit" })
      .hasAttribute("disabled"),
  ).toBe(false);
  fireEvent.change(input, { target: { value: "9" } });
  await act(async () => rejectWrite(new Error("Save failed")));
  await slot.findByText("Save failed");
  await act(async () => {
    await slot.experimental_invalidateRpc(null);
  });
  await waitFor(() => expect(slot.queryByText("Save failed")).toBeNull());
  expect(input.getAttribute("value")).toBe("9");
});

it.each([false, true])(
  "offers Retry after a failed read with loaded data: %s",
  async (loaded) => {
    let fail = !loaded;
    const slot = renderSlot(
      app.settingsSections[0]!,
      {},
      {
        rpc: {
          getConfiguration: () => {
            if (fail) throw new Error("Limits unavailable");
            return { globalLimit: null, hostOverrides: [], hosts };
          },
        },
      },
    );
    const input = loaded
      ? await slot.findByRole("spinbutton", { name: "Overall thread limit" })
      : null;
    if (input) {
      fireEvent.change(input, { target: { value: "9" } });
      fail = true;
      await act(async () => {
        await slot.experimental_invalidateRpc(null);
      });
    }
    await slot.findByText("Limits unavailable", {}, { timeout: 12000 });
    fail = false;
    fireEvent.click(slot.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(slot.queryByText("Limits unavailable")).toBeNull(),
    );
    const recovered = slot.getByRole("spinbutton", {
      name: "Overall thread limit",
    });
    if (input) {
      expect(recovered).toBe(input);
      expect(recovered.getAttribute("value")).toBe("9");
    }
  },
  20000,
);

import { useMemo } from "react";
import {
  useRpc,
  experimental_useRpcMutation,
  type ExperimentalRpcOptimisticCache,
  type PluginRpcResult,
} from "@get-bb/plugin-sdk/app";
import type { docsRpcContract } from "./server.js";

type Notebook = PluginRpcResult<(typeof docsRpcContract)["listNotes"]>;

function predictNotebook(
  cache: ExperimentalRpcOptimisticCache<typeof docsRpcContract>,
  vaultId: string | undefined,
  update: (current: Notebook) => Notebook,
) {
  if (vaultId !== undefined) cache.update("listNotes", { vaultId }, update);
  cache.update("listNotes", {}, (current) =>
    vaultId === undefined || current.vault.id === vaultId
      ? update(current)
      : current,
  );
}

export function useDocsRpc() {
  const rpc = useRpc<typeof docsRpcContract>();
  const { mutate: saveNote } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "saveNote"
  >({ method: "saveNote" });
  const { mutate: updateProposal } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "updateProposal"
  >({ method: "updateProposal" });
  const { mutate: resolveProposal } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "resolveProposal"
  >({ method: "resolveProposal" });
  const { mutate: createNote } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "createNote"
  >({ method: "createNote" });
  const { mutate: deletePath } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "deletePath"
  >({
    method: "deletePath",
    optimistic(input, cache) {
      const removed = (path: string) =>
        path === input.path || path.startsWith(`${input.path}/`);
      predictNotebook(cache, input.vaultId, (current) => ({
        ...current,
        entries: current.entries.filter((entry) => !removed(entry.path)),
        notes: current.notes.filter((note) => !removed(note.path)),
        entryOrder: current.entryOrder.filter((path) => !removed(path)),
      }));
    },
  });
  const { mutate: createFolder } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "createFolder"
  >({
    method: "createFolder",
    optimistic(input, cache) {
      predictNotebook(cache, input.vaultId, (current) => ({
        ...current,
        entries: current.entries.some((entry) => entry.path === input.path)
          ? current.entries
          : [...current.entries, { kind: "directory", path: input.path }],
      }));
    },
  });
  const { mutate: reorderFiles } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "reorderFiles"
  >({
    method: "reorderFiles",
    optimistic(input, cache) {
      predictNotebook(cache, input.vaultId, (current) => ({
        ...current,
        entryOrder: [
          ...current.entryOrder.filter(
            (path) => path.split("/").slice(0, -1).join("/") !== input.parent,
          ),
          ...input.paths,
        ],
      }));
    },
  });
  const { mutate: movePath } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "movePath"
  >({
    method: "movePath",
    optimistic(input, cache) {
      const moved = (path: string) =>
        path === input.from || path.startsWith(`${input.from}/`)
          ? input.to + path.slice(input.from.length)
          : path;
      predictNotebook(cache, input.vaultId, (current) => ({
        ...current,
        entries: current.entries.map((entry) => ({
          ...entry,
          path: moved(entry.path),
        })),
        notes: current.notes.map((note) => ({
          ...note,
          path: moved(note.path),
        })),
        entryOrder: current.entryOrder.map(moved),
      }));
    },
  });
  const { mutate: renameToTitle } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "renameToTitle"
  >({ method: "renameToTitle" });
  const { mutate: createVault } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "createVault"
  >({ method: "createVault" });
  const { mutate: uploadAttachment } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "uploadAttachment"
  >({ method: "uploadAttachment" });
  const { mutate: saveOpenedFile } = experimental_useRpcMutation<
    typeof docsRpcContract,
    "saveOpenedFile"
  >({ method: "saveOpenedFile" });
  return useMemo(
    () => ({
      ...rpc,
      saveNote,
      updateProposal,
      resolveProposal,
      createNote,
      deletePath,
      createFolder,
      reorderFiles,
      movePath,
      renameToTitle,
      createVault,
      uploadAttachment,
      saveOpenedFile,
    }),
    [
      rpc,
      saveNote,
      updateProposal,
      resolveProposal,
      createNote,
      deletePath,
      createFolder,
      reorderFiles,
      movePath,
      renameToTitle,
      createVault,
      uploadAttachment,
      saveOpenedFile,
    ],
  );
}

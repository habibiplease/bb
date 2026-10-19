import type { ExperimentalRpcOptimisticCache } from "@get-bb/plugin-sdk/app";
import {
  tasksRpcContract,
  type TasksRpcContract,
  type TaskSummary,
} from "../shared/contract.js";
import { TASK_POSITION_STEP } from "../shared/position.js";

export interface TaskMutationScope {
  projectId?: string;
  taskId?: string;
  boardTasks?: readonly TaskSummary[];
}

export function predictTaskMutation(
  method: keyof TasksRpcContract,
  input: unknown,
  cache: ExperimentalRpcOptimisticCache<TasksRpcContract>,
  scope: TaskMutationScope,
) {
  switch (method) {
    case "renameFolder": {
      const update = tasksRpcContract.renameFolder.input.parse(input);
      cache.update("listFolders", null, (current) => ({
        ...current,
        folders: current.folders.map((folder) =>
          folder.id === update.folderId
            ? { ...folder, name: update.name }
            : folder,
        ),
      }));
      break;
    }
    case "moveFolder": {
      const update = tasksRpcContract.moveFolder.input.parse(input);
      cache.update("listFolders", null, (current) => ({
        ...current,
        folders: current.folders.map((folder) =>
          folder.id === update.folderId
            ? { ...folder, parentFolderId: update.parentFolderId }
            : folder,
        ),
      }));
      break;
    }
    case "deleteFolder": {
      const update = tasksRpcContract.deleteFolder.input.parse(input);
      cache.update("listFolders", null, (current) => ({
        ...current,
        folders: current.folders
          .filter((folder) => folder.id !== update.folderId)
          .map((folder) =>
            folder.parentFolderId === update.folderId
              ? { ...folder, parentFolderId: null }
              : folder,
          ),
      }));
      cache.update("listProjects", {}, (current) => ({
        ...current,
        projects: current.projects.map((project) =>
          project.folderId === update.folderId
            ? { ...project, folderId: null }
            : project,
        ),
      }));
      break;
    }
    case "updateProject": {
      const { projectId, ...patch } =
        tasksRpcContract.updateProject.input.parse(input);
      cache.update("listProjects", {}, (current) => ({
        ...current,
        projects: current.projects.map((project) =>
          project.id === projectId ? { ...project, ...patch } : project,
        ),
      }));
      break;
    }
    case "deletePreset": {
      const update = tasksRpcContract.deletePreset.input.parse(input);
      cache.update("listPresets", null, (current) => ({
        ...current,
        presets: current.presets.filter(
          (preset) => preset.id !== update.presetId,
        ),
      }));
      break;
    }
    case "updatePreset": {
      const { presetId, ...patch } =
        tasksRpcContract.updatePreset.input.parse(input);
      cache.update("listPresets", null, (current) => ({
        ...current,
        presets: current.presets.map((preset) =>
          preset.id === presetId ? { ...preset, ...patch } : preset,
        ),
      }));
      break;
    }
    case "updateLabel": {
      if (scope.projectId === undefined) break;
      const { labelId, ...patch } =
        tasksRpcContract.updateLabel.input.parse(input);
      cache.update("listLabels", { projectId: scope.projectId }, (current) => ({
        ...current,
        labels: current.labels.map((label) =>
          label.id === labelId ? { ...label, ...patch } : label,
        ),
      }));
      cache.updateKey("getLabelsKeyed", scope.projectId, (current) =>
        current.map((label) =>
          label.id === labelId ? { ...label, ...patch } : label,
        ),
      );
      break;
    }
    case "deleteLabel": {
      if (scope.projectId === undefined) break;
      const { labelId } = tasksRpcContract.deleteLabel.input.parse(input);
      cache.update("listLabels", { projectId: scope.projectId }, (current) => ({
        ...current,
        labels: current.labels.filter((label) => label.id !== labelId),
      }));
      cache.updateKey("getLabelsKeyed", scope.projectId, (current) =>
        current.filter((label) => label.id !== labelId),
      );
      break;
    }
    case "deleteAttachment": {
      if (scope.taskId === undefined) break;
      const { attachmentId } =
        tasksRpcContract.deleteAttachment.input.parse(input);
      cache.update("listAttachments", { taskId: scope.taskId }, (current) => ({
        ...current,
        attachments: current.attachments.filter(
          (attachment) => attachment.id !== attachmentId,
        ),
      }));
      cache.updateKey("getTaskAttachmentsKeyed", scope.taskId, (current) =>
        current.filter((attachment) => attachment.id !== attachmentId),
      );
      break;
    }
    case "boardMove": {
      const update = tasksRpcContract.boardMove.input.parse(input);
      const rows = scope.boardTasks;
      const before = rows?.find(
        (task) => task.id === update.beforeTaskId,
      )?.position;
      const after = rows?.find(
        (task) => task.id === update.afterTaskId,
      )?.position;
      const position =
        before !== undefined && after !== undefined
          ? (before + after) / 2
          : before !== undefined
            ? before + TASK_POSITION_STEP
            : after !== undefined
              ? after / 2
              : rows === undefined
                ? undefined
                : Math.max(
                    0,
                    ...rows
                      .filter(
                        (task) =>
                          task.id !== update.taskId &&
                          task.status === update.status,
                      )
                      .map((task) => task.position),
                  ) + TASK_POSITION_STEP;
      const predict = (task: TaskSummary | null) =>
        task === null
          ? null
          : {
              ...task,
              status: update.status,
              ...(position === undefined ? {} : { position }),
            };
      cache.updateKey("getTasksKeyed", update.taskId, predict);
      cache.update("getTask", { taskId: update.taskId }, (current) => ({
        ...current,
        task:
          current.task === null
            ? null
            : { ...current.task, ...predict(current.task) },
      }));
      const taskKey = rows?.find((task) => task.id === update.taskId)?.key;
      if (taskKey !== undefined)
        cache.update("getTaskByKey", { taskKey }, (current) => ({
          ...current,
          task:
            current.task === null
              ? null
              : { ...current.task, ...predict(current.task) },
        }));
      break;
    }
    case "moveTaskToProject": {
      const update = tasksRpcContract.moveTaskToProject.input.parse(input);
      cache.updateKey("getTasksKeyed", update.taskId, (task) =>
        task === null
          ? null
          : { ...task, projectId: update.projectId, parentTaskId: null },
      );
      cache.update("getTask", { taskId: update.taskId }, (current) => ({
        ...current,
        task:
          current.task === null
            ? null
            : {
                ...current.task,
                projectId: update.projectId,
                parentTaskId: null,
              },
      }));
      break;
    }
  }
}

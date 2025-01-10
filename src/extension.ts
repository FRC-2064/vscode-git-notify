import * as vscode from "vscode";
import { WebSocket } from "ws";

interface UpdateMessage {
  repoName: string;
  lastUpdate: string;
  commitHash: string;
  branch: string;
  author: string;
}

interface GitRemote {
  fetchUrl: string | undefined;
}

let websocket: WebSocket | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(debug-disconnect) Git Notify";
  statusBarItem.command = "gitNotify.connect";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  let connectCmd = vscode.commands.registerCommand("gitNotify.connect", () => {
    connectToServer();
  });

  let disconnectCmd = vscode.commands.registerCommand(
    "gitNotify.disconnect",
    () => {
      disconnectFromServer();
    },
  );

  context.subscriptions.push(connectCmd, disconnectCmd);

  connectToServer();
}

function connectToServer() {
  if (websocket) {
    return;
  }

  const config = vscode.workspace.getConfiguration("gitNotify");
  const serverURL = config.get<string>("serverUrl");

  if (!serverURL) {
    vscode.window.showErrorMessage("Git Notify server URL is not configured");
    return;
  }

  websocket = new WebSocket(serverURL);

  websocket.on("message", (data: Buffer) => {
    try {
      const update: UpdateMessage = JSON.parse(data.toString());
      showUpdateNotification(update);
    } catch (err) {
      console.error("Error parsing message:", err);
    }
  });

  websocket.on("close", () => {
    statusBarItem.text = "$(debug-disconnect) Git Notify";
    statusBarItem.command = "gitNotify.connect";
    websocket = undefined;
  });

  websocket.on("error", (error) => {
    vscode.window.showErrorMessage(`Git Notify Error: ${error.message}`);
    disconnectFromServer();
  });
}

function disconnectFromServer() {
  if (websocket) {
    websocket.close();
    websocket = undefined;
    vscode.window.showInformationMessage(
      "Disconnected from Git notification server",
    );
  }
}

function showUpdateNotification(update: UpdateMessage) {
  const message = `Repository "${update.repoName}" has been updated\nBranch: ${update.branch}\nCommit: ${update.commitHash.substring(0, 8)}\nAuthor: ${update.author}`;

  vscode.window
    .showInformationMessage(message, "Pull Changes", "Dismiss")
    .then((selection) => {
      if (selection === "Pull Changes") {
        const gitExtension =
          vscode.extensions.getExtension("vscode.git")?.exports;
        if (gitExtension) {
          const git = gitExtension.getAPI(1);
          const repos = git.repositories;

          const repo = repos.find((r: { state: { remotes: GitRemote[] } }) =>
            r.state.remotes.some((remote: GitRemote) =>
              remote.fetchUrl?.includes(update.repoName),
            ),
          );

          if (repo) {
            repo.pull();
          }
        }
      }
    });
}

export function deactivate() {
  disconnectFromServer();
}

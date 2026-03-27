import { existsSync, readFileSync } from "fs";
import { execFile } from "child_process";
import { homedir } from "os";
import { join } from "path";
import type { Bookmark, BookmarkNode, ChromeInstallation, ChromeProfile, LocalStateProfile } from "../types";

const FLATPAK_CONFIG = join(homedir(), ".var/app/com.google.Chrome/config/google-chrome");
const NATIVE_CONFIG = join(homedir(), ".config/google-chrome");

export function detectInstallation(preference: string = "auto"): ChromeInstallation {
  if (preference === "flatpak" || (preference === "auto" && existsSync(join(FLATPAK_CONFIG, "Local State")))) {
    return {
      type: "flatpak",
      configDir: FLATPAK_CONFIG,
      launchCommand: ["flatpak", "run", "com.google.Chrome"],
    };
  }

  if (preference === "native" || (preference === "auto" && existsSync(join(NATIVE_CONFIG, "Local State")))) {
    return {
      type: "native",
      configDir: NATIVE_CONFIG,
      launchCommand: ["google-chrome"],
    };
  }

  throw new Error("Chrome installation not found");
}

export function getProfiles(installation: ChromeInstallation): ChromeProfile[] {
  const localStatePath = join(installation.configDir, "Local State");
  const data = JSON.parse(readFileSync(localStatePath, "utf-8"));
  const infoCache: Record<string, LocalStateProfile> = data?.profile?.info_cache ?? {};

  return Object.entries(infoCache).map(([dirName, info]) => {
    const profilePath = join(installation.configDir, dirName);
    const gaiaPic = info.gaia_picture_file_name;
    const avatarFile = gaiaPic ? join(profilePath, gaiaPic) : undefined;
    const avatarPath = avatarFile && existsSync(avatarFile) ? avatarFile : undefined;

    return {
      directoryName: dirName,
      displayName: info.name,
      email: info.user_name || "",
      avatarPath,
      profilePath,
    };
  });
}

export function getBookmarks(profile: ChromeProfile): Bookmark[] {
  const bookmarksPath = join(profile.profilePath, "Bookmarks");
  if (!existsSync(bookmarksPath)) return [];

  const data = JSON.parse(readFileSync(bookmarksPath, "utf-8"));
  const roots = data?.roots ?? {};
  const results: Bookmark[] = [];

  for (const [rootName, rootNode] of Object.entries(roots)) {
    const node = rootNode as BookmarkNode;
    if (node.children) {
      const label = rootName === "bookmark_bar" ? "Bookmark Bar" : rootName === "other" ? "Other" : rootName;
      flattenBookmarks(node.children, label, results);
    }
  }

  return results;
}

function flattenBookmarks(children: BookmarkNode[], parentPath: string, results: Bookmark[]): void {
  for (const child of children) {
    if (child.type === "url" && child.url) {
      results.push({ name: child.name, url: child.url, folderPath: parentPath });
    } else if (child.type === "folder" && child.children) {
      flattenBookmarks(child.children, `${parentPath} > ${child.name}`, results);
    }
  }
}

export function launchProfile(installation: ChromeInstallation, profileDir: string, newTab?: boolean): void {
  const args = [...installation.launchCommand.slice(1), `--profile-directory=${profileDir}`];
  if (newTab) args.push("--new-tab");

  const child = execFile(installation.launchCommand[0], args, { detached: true, stdio: "ignore" } as never);
  child.unref?.();
}

export function openBookmark(installation: ChromeInstallation, profileDir: string, url: string): void {
  const args = [...installation.launchCommand.slice(1), `--profile-directory=${profileDir}`, url];

  const child = execFile(installation.launchCommand[0], args, { detached: true, stdio: "ignore" } as never);
  child.unref?.();
}

export function isProfileRunning(profilePath: string): boolean {
  return existsSync(join(profilePath, "SingletonLock"));
}

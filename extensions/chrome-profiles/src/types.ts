export interface ChromeProfile {
  /** Directory name: "Default", "Profile 1", etc. */
  directoryName: string;
  /** User-chosen display name */
  displayName: string;
  /** Google account email, empty if not signed in */
  email: string;
  /** Path to the profile avatar image, or undefined */
  avatarPath: string | undefined;
  /** Absolute path to the profile directory */
  profilePath: string;
}

export interface ChromeInstallation {
  type: "flatpak" | "native";
  /** Base config directory (e.g. ~/.var/app/.../google-chrome/) */
  configDir: string;
  /** Command parts to launch Chrome */
  launchCommand: string[];
}

export interface Bookmark {
  name: string;
  url: string;
  /** Breadcrumb path for nested bookmarks (e.g. "Bookmark Bar > Work > Dev") */
  folderPath: string;
}

export interface BookmarkNode {
  name: string;
  type: "url" | "folder";
  url?: string;
  children?: BookmarkNode[];
}

export interface LocalStateProfile {
  name: string;
  user_name: string;
  gaia_picture_file_name?: string;
}

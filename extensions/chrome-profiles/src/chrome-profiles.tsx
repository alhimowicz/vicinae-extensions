import { List, ActionPanel, Action, Icon, showToast, Toast, useNavigation, getPreferenceValues } from "@vicinae/api";
import { useState, useEffect } from "react";
import { detectInstallation, getProfiles, launchProfile, isProfileRunning } from "./utils/chrome";
import type { ChromeInstallation, ChromeProfile } from "./types";
import { BookmarksList } from "./bookmarks-list";

export default function ChromeProfiles() {
  const [isLoading, setIsLoading] = useState(true);
  const [profiles, setProfiles] = useState<ChromeProfile[]>([]);
  const [installation, setInstallation] = useState<ChromeInstallation | null>(null);
  const { push } = useNavigation();

  useEffect(() => {
    try {
      const { chromeVariant } = getPreferenceValues<{ chromeVariant: string }>();
      const inst = detectInstallation(chromeVariant);
      setInstallation(inst);
      setProfiles(getProfiles(inst));
    } catch (e) {
      showToast({ title: "Chrome not found", message: String(e), style: Toast.Style.Failure });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search Chrome profiles...">
      {profiles.map((profile) => {
        const running = isProfileRunning(profile.profilePath);
        return (
          <List.Item
            key={profile.directoryName}
            title={profile.displayName}
            subtitle={profile.email || undefined}
            icon={profile.avatarPath ?? Icon.PersonCircle}
            accessories={running ? [{ text: "Running" }] : []}
            actions={
              <ActionPanel>
                <Action
                  title="Bring to Front"
                  icon={Icon.AppWindowGrid3x3}
                  onAction={() => {
                    launchProfile(installation!, profile.directoryName);
                  }}
                />
                <Action
                  title="New Tab"
                  icon={Icon.Plus}
                  onAction={() => {
                    launchProfile(installation!, profile.directoryName, true);
                  }}
                />
                <Action
                  title="Bookmarks"
                  icon={Icon.Bookmark}
                  onAction={() => {
                    push(<BookmarksList installation={installation!} profile={profile} />);
                  }}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

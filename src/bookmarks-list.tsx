import { List, ActionPanel, Action, Icon } from "@vicinae/api";
import { useState, useEffect } from "react";
import { getBookmarks, openBookmark } from "./utils/chrome";
import type { Bookmark, ChromeInstallation, ChromeProfile } from "./types";

interface Props {
  installation: ChromeInstallation;
  profile: ChromeProfile;
}

export function BookmarksList({ installation, profile }: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    try {
      setBookmarks(getBookmarks(profile));
    } catch {
      // No bookmarks file
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={`Search bookmarks for ${profile.displayName}...`}
      navigationTitle={`${profile.displayName} Bookmarks`}
    >
      {bookmarks.map((bm, idx) => {
        let hostname = "";
        try {
          hostname = new URL(bm.url).hostname;
        } catch {
          // invalid URL
        }

        return (
          <List.Item
            key={`${bm.url}-${idx}`}
            title={bm.name}
            subtitle={bm.folderPath}
            icon={Icon.Link}
            accessories={hostname ? [{ text: hostname }] : []}
            actions={
              <ActionPanel>
                <Action
                  title="Open in Chrome"
                  icon={Icon.Globe01}
                  onAction={() => {
                    openBookmark(installation, profile.directoryName, bm.url);
                  }}
                />
                <Action.CopyToClipboard title="Copy URL" content={bm.url} />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}

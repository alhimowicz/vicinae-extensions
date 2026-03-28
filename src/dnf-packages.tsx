import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  Color,
} from "@vicinae/api";
import { useState, useEffect, useCallback, useRef } from "react";
import type { PackageListItem, DnfPackage } from "./types";
import {
  getPopularPackages,
  getFormattedInstalls,
  searchPackages,
  getPackageInfo,
  installPackage,
  getInstallCommand,
} from "./utils/dnf";

const PACKAGE_ICONS: Record<string, string> = {
  firefox: Icon.Globe01,
  chromium: Icon.Globe01,
  git: Icon.Code,
  nodejs: Icon.Code,
  python3: Icon.Code,
  golang: Icon.Code,
  rust: Icon.Code,
  gcc: Icon.Code,
  cmake: Icon.Code,
  make: Icon.Code,
  "java-latest-openjdk": Icon.Code,
  neovim: Icon.Terminal,
  "vim-enhanced": Icon.Terminal,
  tmux: Icon.Terminal,
  zsh: Icon.Terminal,
  htop: Icon.Terminal,
  ranger: Icon.Terminal,
  fzf: Icon.Terminal,
  ripgrep: Icon.Terminal,
  "fd-find": Icon.Terminal,
  bat: Icon.Terminal,
  exa: Icon.Terminal,
  jq: Icon.Terminal,
  neofetch: Icon.Terminal,
  fastfetch: Icon.Terminal,
  curl: Icon.Download,
  wget: Icon.Download,
  gimp: Icon.Image,
  inkscape: Icon.Image,
  blender: Icon.Image,
  vlc: Icon.Video,
  mpv: Icon.Video,
  "obs-studio": Icon.Video,
  audacity: Icon.Music,
  kdenlive: Icon.Video,
  steam: Icon.GameController,
  podman: Icon.Box,
  "docker-ce": Icon.Box,
  flatpak: Icon.Box,
  nginx: Icon.Network,
  httpd: Icon.Network,
  redis: Icon.HardDrive,
  "postgresql-server": Icon.HardDrive,
  sqlite: Icon.HardDrive,
  libreoffice: Icon.BlankDocument,
  thunderbird: Icon.Envelope,
  transmission: Icon.Download,
  filezilla: Icon.Upload,
  keepassxc: Icon.Lock,
  "gnome-tweaks": Icon.Cog,
  code: Icon.Code,
};

function getPackageIcon(name: string): string {
  return PACKAGE_ICONS[name] ?? Icon.Box;
}

function buildDetailMarkdown(name: string, info: DnfPackage | null | undefined): string {
  if (!info) return `# ${name}\n\n*Loading package details...*`;

  return [
    `# ${info.name}`,
    "",
    info.summary,
    "",
    "---",
    "",
    info.description,
    "",
    info.url ? `[Homepage](${info.url})` : "",
  ].join("\n");
}

function buildDetailMetadata(info: DnfPackage | null | undefined) {
  if (!info) return undefined;

  return (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.Label title="Version" text={`${info.version}-${info.release}`} />
      <List.Item.Detail.Metadata.Label title="Architecture" text={info.arch} />
      <List.Item.Detail.Metadata.Label title="License" text={info.license} />
      <List.Item.Detail.Metadata.Label title="Repository" text={info.repo} />
      <List.Item.Detail.Metadata.Label title="Size" text={info.size} />
      <List.Item.Detail.Metadata.Separator />
      <List.Item.Detail.Metadata.TagList title="Status">
        <List.Item.Detail.Metadata.TagList.Item
          text={info.installed ? "Installed" : "Not Installed"}
          color={info.installed ? Color.Green : Color.Orange}
        />
      </List.Item.Detail.Metadata.TagList>
      {info.url && (
        <List.Item.Detail.Metadata.Link title="Homepage" target={info.url} text={info.url} />
      )}
    </List.Item.Detail.Metadata>
  );
}

export default function DnfPackages() {
  const [isLoading, setIsLoading] = useState(true);
  const [packages, setPackages] = useState<PackageListItem[]>([]);
  const [showDetail, setShowDetail] = useState(false);
  const [detailInfo, setDetailInfo] = useState<Record<string, DnfPackage | null>>({});
  const [selectedId, setSelectedId] = useState<string>("");
  const lastSearch = useRef("");

  useEffect(() => {
    setTimeout(() => {
      try {
        setPackages(getPopularPackages());
      } catch {
        showToast({ title: "Failed to load packages", style: Toast.Style.Failure });
      }
      setIsLoading(false);
    }, 0);
  }, []);

  const handleSearch = useCallback((text: string) => {
    lastSearch.current = text;

    if (!text.trim()) {
      setIsLoading(true);
      setTimeout(() => {
        if (lastSearch.current !== text) return;
        try {
          setPackages(getPopularPackages());
        } catch {
          showToast({ title: "Failed to load packages", style: Toast.Style.Failure });
        }
        setIsLoading(false);
      }, 0);
      return;
    }

    if (text.length >= 2) {
      setIsLoading(true);
      setTimeout(() => {
        if (lastSearch.current !== text) return;
        try {
          setPackages(searchPackages(text));
        } catch {
          showToast({ title: "Search failed", style: Toast.Style.Failure });
        }
        setIsLoading(false);
      }, 0);
    }
  }, []);

  const handleSelectionChange = useCallback((id: string) => {
    if (!id) return;
    setSelectedId(id);
    if (detailInfo[id] !== undefined) return;
    setDetailInfo((prev) => ({ ...prev, [id]: null }));
    setTimeout(() => {
      const info = getPackageInfo(id);
      if (info) {
        setDetailInfo((prev) => ({ ...prev, [id]: info }));
      } else {
        showToast({ title: "Failed to load package info", message: id, style: Toast.Style.Failure });
        setDetailInfo((prev) => ({
          ...prev,
          [id]: {
            name: id, version: "-", release: "", arch: "-",
            summary: "Failed to load package details",
            description: "Could not retrieve package information. The package may not exist in any enabled repository.",
            url: "", license: "-", repo: "-", size: "-", installed: false,
          },
        }));
      }
    }, 0);
  }, [detailInfo]);

  const handleInstall = useCallback((name: string) => {
    showToast({ title: "Installing...", message: name, style: Toast.Style.Animated });
    setTimeout(() => {
      try {
        installPackage(name);
        showToast({ title: "Installed", message: name, style: Toast.Style.Success });
        setPackages((prev) =>
          prev.map((p) => (p.name === name ? { ...p, installed: true } : p))
        );
      } catch (e) {
        showToast({
          title: "Installation failed",
          message: String(e),
          style: Toast.Style.Failure,
        });
      }
    }, 0);
  }, []);

  return (
    <List
      isLoading={isLoading || (showDetail && (!detailInfo[selectedId] || detailInfo[selectedId] === null))}
      searchBarPlaceholder="Search DNF packages..."
      onSearchTextChange={handleSearch}
      onSelectionChange={handleSelectionChange}
      filtering={false}
      throttle
      isShowingDetail={showDetail}
    >
      <List.Section title={lastSearch.current ? "Search Results" : "Popular Packages"} subtitle={`${packages.length} packages`}>
        {packages.map((pkg) => {
          const info = detailInfo[pkg.name];
          const detailLoading = info === null || info === undefined;

          return (
            <List.Item
              id={pkg.name}
              key={pkg.name}
              title={pkg.name}
              subtitle={showDetail ? undefined : pkg.summary || undefined}
              icon={{ source: getPackageIcon(pkg.name), tintColor: pkg.installed ? Color.Green : Color.PrimaryText }}
              accessories={
                showDetail
                  ? undefined
                  : [
                      pkg.installed
                        ? { tag: { value: "Installed", color: Color.Green } }
                        : undefined,
                      pkg.installs > 0
                        ? { text: getFormattedInstalls(pkg.installs) }
                        : undefined,
                    ].filter(Boolean) as List.Item.Accessory[]
              }
              detail={
                <List.Item.Detail
                  isLoading={detailLoading}
                  markdown={buildDetailMarkdown(pkg.name, info)}
                  metadata={buildDetailMetadata(info)}
                />
              }
              actions={
                <ActionPanel>
                  <Action
                    title="Toggle Detail View"
                    icon={Icon.AppWindowSidebarRight}
                    shortcut={{ modifiers: ["ctrl"], key: "b" }}
                    onAction={() => setShowDetail((v) => !v)}
                  />
                  {!pkg.installed && (
                    <Action
                      title="Install Package"
                      icon={Icon.Download}
                      shortcut={{ modifiers: ["ctrl"], key: "i" }}
                      onAction={() => handleInstall(pkg.name)}
                    />
                  )}
                  <Action.CopyToClipboard
                    title="Copy Package Name"
                    content={pkg.name}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy Install Command"
                    content={getInstallCommand(pkg.name)}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                </ActionPanel>
              }
            />
          );
        })}
      </List.Section>
    </List>
  );
}

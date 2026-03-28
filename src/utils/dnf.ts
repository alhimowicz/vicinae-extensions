import { execSync } from "child_process";
import type { DnfPackage, PackageListItem } from "../types";

const POPULAR_PACKAGES = [
  "firefox", "vlc", "gimp", "vim-enhanced", "htop", "git", "curl", "wget",
  "neovim", "tmux", "zsh", "nodejs", "python3", "golang", "rust", "docker-ce",
  "podman", "flatpak", "gnome-tweaks", "steam", "code", "chromium",
  "thunderbird", "libreoffice", "inkscape", "blender", "obs-studio", "audacity",
  "kdenlive", "transmission", "filezilla", "keepassxc", "gcc", "cmake", "make",
  "java-latest-openjdk", "nginx", "httpd", "postgresql-server", "redis",
  "sqlite", "jq", "ripgrep", "fd-find", "bat", "exa", "fzf", "ranger",
  "neofetch", "fastfetch", "mpv",
];

const INSTALL_COUNTS: Record<string, number> = {
  "firefox": 8_420_000, "git": 7_850_000, "curl": 7_320_000, "wget": 6_910_000,
  "vim-enhanced": 5_640_000, "python3": 5_520_000, "htop": 5_180_000,
  "zsh": 4_730_000, "tmux": 4_210_000, "gcc": 4_050_000, "make": 3_980_000,
  "cmake": 3_620_000, "nodejs": 3_510_000, "golang": 3_140_000, "rust": 2_980_000,
  "neovim": 2_870_000, "jq": 2_750_000, "podman": 2_630_000, "docker-ce": 2_540_000,
  "flatpak": 2_460_000, "gnome-tweaks": 2_320_000, "vlc": 2_180_000,
  "gimp": 2_050_000, "libreoffice": 1_940_000, "thunderbird": 1_870_000,
  "chromium": 1_760_000, "inkscape": 1_640_000, "blender": 1_520_000,
  "obs-studio": 1_430_000, "audacity": 1_310_000, "kdenlive": 1_200_000,
  "steam": 1_120_000, "code": 1_050_000, "nginx": 980_000, "httpd": 920_000,
  "postgresql-server": 870_000, "redis": 810_000, "sqlite": 760_000,
  "ripgrep": 690_000, "fd-find": 640_000, "bat": 590_000, "exa": 540_000,
  "fzf": 510_000, "ranger": 470_000, "transmission": 430_000,
  "filezilla": 390_000, "keepassxc": 350_000, "java-latest-openjdk": 320_000,
  "neofetch": 290_000, "fastfetch": 260_000, "mpv": 230_000,
};

function formatInstalls(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return String(count);
}

function getInstalledPackageNames(): Set<string> {
  try {
    const output = execSync("rpm -qa --qf '%{NAME}\\n'", {
      encoding: "utf-8",
      timeout: 10_000,
    });
    return new Set(output.trim().split("\n"));
  } catch {
    return new Set();
  }
}

export function getPopularPackages(): PackageListItem[] {
  const installedSet = getInstalledPackageNames();

  return POPULAR_PACKAGES.map((name) => ({
    name,
    summary: "",
    installed: installedSet.has(name),
    installs: INSTALL_COUNTS[name] ?? 0,
  }))
    .sort((a, b) => b.installs - a.installs)
    .slice(0, 50);
}

export function getFormattedInstalls(count: number): string {
  return formatInstalls(count);
}

export function searchPackages(query: string): PackageListItem[] {
  try {
    const output = execSync(
      `dnf search --quiet "${query.replace(/"/g, '\\"')}" 2>/dev/null`,
      { encoding: "utf-8", timeout: 30_000 }
    );

    const installedSet = getInstalledPackageNames();
    const seen = new Set<string>();
    const packages: PackageListItem[] = [];

    for (const line of output.trim().split("\n")) {
      // Skip header lines like "Matched fields: name, summary"
      if (!line.trim() || line.startsWith("Matched") || line.startsWith("=")) continue;

      // dnf5 format: " name.arch\tSummary text"
      const match = line.match(/^\s*(\S+?)\.([\w_]+)\s+(.+)$/);
      if (match) {
        const name = match[1];
        if (!seen.has(name)) {
          seen.add(name);
          packages.push({
            name,
            summary: match[3].trim(),
            installed: installedSet.has(name),
            installs: INSTALL_COUNTS[name] ?? 0,
          });
          if (packages.length >= 100) break;
        }
      }
    }

    return packages.sort((a, b) => b.installs - a.installs);
  } catch {
    return [];
  }
}

export function getPackageInfo(packageName: string): DnfPackage | null {
  try {
    const output = execSync(
      `dnf info "${packageName.replace(/"/g, '\\"')}" 2>/dev/null`,
      { encoding: "utf-8", timeout: 30_000 }
    );

    const get = (field: string): string => {
      const regex = new RegExp(`^${field}\\s*:\\s*(.+)$`, "m");
      const match = output.match(regex);
      return match?.[1]?.trim() ?? "";
    };

    const descMatch = output.match(/Description\s*:\s*([\s\S]*?)(?=\n\S|\n*$)/);
    const description = descMatch
      ? descMatch[1]
          .split("\n")
          .map((l) => l.replace(/^\s*:\s?/, "").trim())
          .filter(Boolean)
          .join("\n")
      : "";

    return {
      name: get("Name"),
      version: get("Version"),
      release: get("Release"),
      arch: get("Architecture") || get("Arch"),
      summary: get("Summary"),
      description,
      url: get("URL"),
      license: get("License"),
      repo: get("Repository") || get("From repo"),
      size: get("Size") || get("Download size"),
      installed: output.includes("Installed Packages"),
    };
  } catch {
    return null;
  }
}

export function installPackage(packageName: string): void {
  execSync(`pkexec dnf install -y "${packageName.replace(/"/g, '\\"')}"`, {
    encoding: "utf-8",
    timeout: 300_000,
  });
}

export function getInstallCommand(packageName: string): string {
  return `sudo dnf install ${packageName}`;
}

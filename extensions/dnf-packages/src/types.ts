export interface DnfPackage {
  name: string;
  version: string;
  release: string;
  arch: string;
  summary: string;
  description: string;
  url: string;
  license: string;
  repo: string;
  size: string;
  installed: boolean;
}

export interface PackageListItem {
  name: string;
  summary: string;
  installed: boolean;
  installs: number;
}

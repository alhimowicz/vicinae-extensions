import { execFileSync } from "node:child_process";
import { join } from "node:path";
import type { PwaInfo } from "./pwa.ts";
import type { Browser } from "./browsers.ts";
import { legacyBrowser } from "./browsers.ts";
import type { Runtime } from "./runtime.ts";
import { dataHome, pythonExecutable } from "./platform.ts";

type PwaApp = { id: string; profile: string; pwa?: PwaInfo; pwaDesktopId?: string; browser?: Browser; runtime?: Runtime };
export type NativePwa = { file: string; desktopId: string; appId: string; profile: string; owner: string | null };
const applicationDirectory = join(dataHome(), "applications");

const nativeDesktop = `
import gi,json,os,shutil,sys,tempfile
from pathlib import Path
from gi.repository import GLib
def load(path):
    entry=GLib.KeyFile()
    entry.load_from_file(str(path),GLib.KeyFileFlags.KEEP_COMMENTS|GLib.KeyFileFlags.KEEP_TRANSLATIONS)
    args=GLib.shell_parse_argv(entry.get_string('Desktop Entry','Exec'))[1]
    if flatpak_id:
        if flatpak_id not in args or Path(shutil.which(args[0]) or args[0]).resolve()!=Path(program).resolve(): return None
    elif Path(shutil.which(args[0]) or args[0]).resolve()!=Path(program).resolve(): return None
    declared_data=next((arg.split('=',1)[1] for arg in args if arg.startswith('--user-data-dir=')),None)
    if declared_data and Path(declared_data).resolve()!=Path(data_directory).resolve(): return None
    if custom and not declared_data: return None
    app_id=next((arg.split('=',1)[1] for arg in args if arg.startswith('--app-id=')),None)
    if not app_id: return None
    profile=next((arg.split('=',1)[1] for arg in args if arg.startswith('--profile-directory=')),'Default')
    return entry,app_id,profile
def optional(entry,key):
    try: return entry.get_string('Desktop Entry',key)
    except GLib.Error: return None
mode,directory,program,flatpak_id,data_directory,custom=sys.argv[1:7]
custom=custom=='true'
root=Path(directory)
if mode=='scan':
    result=[]
    for path in root.glob('*.desktop'):
        try:
            if path.is_symlink() or path.stat().st_size>131072: continue
            loaded=load(path)
            if not loaded: continue
            entry,app_id,profile=loaded
            if optional(entry,'X-Vicinae-WebApp'): continue
            result.append({'file':str(path),'desktopId':path.stem,'appId':app_id,'profile':profile,'owner':optional(entry,'X-Vicinae-Pwa-Owner')})
        except (GLib.Error,OSError,ValueError): continue
    print(json.dumps(result))
else:
    filename,app_id,profile,owner=sys.argv[7:11]
    path=Path(filename)
    if path.parent.resolve()!=root.resolve() or path.is_symlink(): raise ValueError('Invalid Chrome launcher path')
    loaded=load(path)
    if not loaded: raise ValueError('Not a Chrome PWA launcher')
    entry,actual_id,actual_profile=loaded
    if (actual_id,actual_profile)!=(app_id,profile): raise ValueError('Chrome PWA identity changed')
    current=optional(entry,'X-Vicinae-Pwa-Owner')
    if mode=='hide':
        if current and current!=owner: raise ValueError('This PWA is already managed by another launcher')
        if current==owner: sys.exit(0)
        entry.set_string('Desktop Entry','X-Vicinae-Pwa-Original-Hidden',optional(entry,'NoDisplay') or 'false')
        entry.set_string('Desktop Entry','X-Vicinae-Pwa-Owner',owner)
        entry.set_boolean('Desktop Entry','NoDisplay',True)
    elif mode=='restore':
        if current!=owner: sys.exit(0)
        entry.set_boolean('Desktop Entry','NoDisplay',optional(entry,'X-Vicinae-Pwa-Original-Hidden')=='true')
        entry.remove_key('Desktop Entry','X-Vicinae-Pwa-Owner')
        entry.remove_key('Desktop Entry','X-Vicinae-Pwa-Original-Hidden')
    else: raise ValueError('Unknown desktop operation')
    fd,temporary=tempfile.mkstemp(prefix='.vicinae-pwa-',dir=root)
    try:
        with os.fdopen(fd,'w') as output: output.write(entry.to_data()[0])
        os.chmod(temporary,0o644)
        os.replace(temporary,path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
`;

function command(app: PwaApp, operation: string, directory: string, ...args: string[]): [string, string[]] {
  const browser = app.browser || legacyBrowser();
  return [app.runtime?.python || pythonExecutable(), ["-c", nativeDesktop, operation, directory, browser.executable, browser.flatpakId || "", browser.userDataDir, String(browser.id === "custom"), ...args]];
}

export function findNativePwa(app: PwaApp, directory = applicationDirectory): NativePwa | undefined {
  if (!app.pwa) return undefined;
  const entries: NativePwa[] = JSON.parse(execFileSync(...command(app, "scan", directory), { encoding: "utf8", timeout: 5000 }));
  return entries.find((entry) => entry.appId === app.pwa!.appId && entry.profile === app.profile && (!entry.owner || entry.owner === app.id));
}

export function hideNativePwa(app: PwaApp, entry: NativePwa, directory = applicationDirectory): void {
  execFileSync(...command(app, "hide", directory, entry.file, entry.appId, app.profile, app.id), { timeout: 5000 });
}

export function releaseNativePwa(app: PwaApp, directory = applicationDirectory): void {
  if (!app.pwaDesktopId) return;
  const entry = findNativePwa(app, directory);
  if (entry?.owner === app.id) execFileSync(...command(app, "restore", directory, entry.file, entry.appId, app.profile, app.id), { timeout: 5000 });
}

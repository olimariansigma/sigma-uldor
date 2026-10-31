// Embeds the game icon + version info into the Windows exe without needing Wine/rcedit.
const fs = require('fs');
const path = require('path');
module.exports = async (ctx) => {
  if (ctx.electronPlatformName !== 'win32') return;
  const ResEdit = (await import('resedit')).default || (await import('resedit'));
  const exe = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.exe`);
  const icoPath = path.join(ctx.packager.info.projectDir, 'build', '.icon-ico', 'icon.ico');
  const data = fs.readFileSync(exe);
  const pe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(pe);
  if (fs.existsSync(icoPath)) {
    const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
    const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
    const id = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map((i) => i.data));
  }
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    vi.setStringValues({ lang: 1033, codepage: 1200 }, { FileDescription: 'Wrecking Yard', ProductName: 'Wrecking Yard', CompanyName: 'Wrecking Yard', OriginalFilename: 'Wrecking Yard.exe' });
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • embedded icon + version info into', path.basename(exe));
};

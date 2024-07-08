# WinDbg JavaScript Scripts


## Install as a WinDbg gallery

 - Clone the repository

```bash
git clone https://github.com/hugsy/windbg_js_scripts
```

 - In `windbg_js_scripts\config.xml`, edit the lines `Setting Name="LocalCacheRootFolder"` to reflect the local path of the repository.

 - In WinDbg, load the `config.xml` file and save the settings:

```text
windbg> .settings load \path\to\windbg_js_scripts\config.xml
[...]\windbg_js_scripts\config.xml has been loaded successfully.
windbg> .settings save
Settings have been saved.
```

Every time WinDbg loads, the galleries will be loaded under `Debugger.State.ExtensionGallery.ExtensionRepositories`:

```text
kd> dx -r1 Debugger.State.ExtensionGallery.ExtensionRepositories
Debugger.State.ExtensionGallery.ExtensionRepositories
    [0x0]            : UserExtensions
    [0x1]            : hugsysgallery
    [0x2]            : overgallery
    [0x3]            : LocalInstalled
```

And the scripts available for the current session can be listed too:

```text
kd> dx -r1 Debugger.State.ExtensionGallery.ExtensionRepositories.Where( x => x.Name == "hugsysgallery" ).First().Packages
Debugger.State.ExtensionGallery.ExtensionRepositories.Where( x => x.Name == "hugsysgallery" ).First().Packages
    [0x0]            : EnumCallbacks
    [0x1]            : GetIdtGdt
    [0x2]            : BreakOnProcessCreate
    [0x3]            : DumpLookasides
    [0x4]            : GetSsdtTable
    [0x5]            : BigPool
    [0x6]            : PageExplorer
    [0x7]            : VadExplorer
    [0x8]            : ObjectExplorer
    [0x9]            : RegistryExplorer
    [0xa]            : GetSiloMonitors
    [0xb]            : EnumApc
    [0xc]            : EnvVars
    [0xd]            : EnumImages
    [0xe]            : CallGraph
    [0xf]            : TraceFunctions
    [0x10]           : CyclicPattern
```


## Related links

 - https://github.com/hugsy/defcon_27_windbg_workshop/blob/master/windbg_cheatsheet.md
 - https://doar-e.github.io/blog/2017/12/01/debugger-data-model
 - https://docs.microsoft.com/en-us/windows-hardware/drivers/debugger/javascript-debugger-example-scripts
 - https://docs.microsoft.com/en-us/windows-hardware/drivers/debugger/native-objects-in-javascript-extensions
 - https://twitter.com/windbgtips
 - https://medium.com/@yardenshafir2/windbg-the-fun-way-part-1-2e4978791f9b

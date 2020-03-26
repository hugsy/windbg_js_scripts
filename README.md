# WinDbg JavaScript Scripts


## Install as a WinDbg gallery

 - Clone the repository
```
C:> git clone https://github.com/hugsy/windbg_js_scripts
```

 - In `windbg_js_scripts\config.xml`, edit the lines `Setting Name="LocalCacheRootFolder"` to reflect the local path of the repository.

 - In WinDbg, load the `config.xml` file and save the settings:
```
0:000> .settings load \path\to\windbg_js_scripts\config.xml
[...]\windbg_js_scripts\config.xml has been loaded successfully.
0:000> .settings save
Settings have been saved.
```

Every time WinDbg loads, the galleries will be loaded:

```
kd> dx -r1 Debugger.State.ExtensionGallery.ExtensionRepositories
Debugger.State.ExtensionGallery.ExtensionRepositories
    [0x0]            : UserExtensions
    [0x1]            : hugsysgallery
    [0x2]            : overgallery
    [0x3]            : LocalInstalled
```


## Related links

 - https://github.com/hugsy/defcon_27_windbg_workshop/blob/master/windbg_cheatsheet.md
 - https://doar-e.github.io/blog/2017/12/01/debugger-data-model
 - https://docs.microsoft.com/en-us/windows-hardware/drivers/debugger/javascript-debugger-example-scripts
 - https://docs.microsoft.com/en-us/windows-hardware/drivers/debugger/native-objects-in-javascript-extensions
 - https://twitter.com/windbgtips
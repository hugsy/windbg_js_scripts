# WinDbg JavaScript Scripts

Learning Windows Internals by debugging it...


## Using as a WinDbg gallery

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
[...]
    [0x1]            : WindowsInternalsKernelGallery
```


## Random links somewhat related:

 - https://docs.microsoft.com/en-us/windows-hardware/drivers/debugger/javascript-debugger-example-scripts
 - https://docs.microsoft.com/en-us/windows-hardware/drivers/debugger/native-objects-in-javascript-extensions
 - https://doar-e.github.io/blog/2017/12/01/debugger-data-model/
 - https://twitter.com/windbgtips
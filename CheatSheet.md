## kd

### Objects ###

Enumerate Objects type (`kd`, `x64` - offset 0x48, `x86` - offset 0x18) 

```
dx -g ((nt!_OBJECT_DIRECTORY*)&nt!ObpRootDirectoryObject)->HashBuckets.Select( o => new { ObjectHeader = o->Object - 48 } )
```

### Processes ###

List Processes (`kd`)

```
dx @$ProcessList = Debugger.Utility.Collections.FromListEntry( *(nt!_LIST_ENTRY*)&(nt!PsActiveProcessHead), "nt!_EPROCESS", "ActiveProcessLinks")
```

### Threads by Process Id ###

```
dx @$ThreadList = Debugger.Utility.Collections.FromListEntry( @$cursession.Processes[<PID>].KernelObject.ThreadListHead, "nt!_ETHREAD", "ThreadListEntry")
```

### ALPC ###

List all ALPC ports by reading `nt!AlpcpPortList`
```
dx -r0 @$AlpcPortList = Debugger.Utility.Collections.FromListEntry( *(_LIST_ENTRY*)&nt!AlpcpPortList, "nt!_ALPC_PORT", "PortListEntry")
```

Use [ObjectExplorer](windbg_js_scripts/ObjectExplorer.js) to collect all objects of type APLC port from object directory namespace
```
dx -r0 @$AlpcPorts = @$cursession.Objects.Children.Where( obj => obj.Name == "RPC Control" ).First().Children.Where( rpc => rpc.Type == "ALPC Port")
```

Using that list to create a new object exposing the ConnectionPorts

```
dx -r0 @$AlpcConnections = @$AlpcPorts.Select( alpc => new { AlpcName= alpc.Name, ServerProcess=alpc.RawHeader->OwnerProcess, ClientProcess=alpc.RawHeader->CommunicationInfo->ConnectionPort->OwnerProcess })
```

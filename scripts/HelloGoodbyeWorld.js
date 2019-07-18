"use strict";

const log = x => host.diagnostics.debugLog(x + "\n");

function invokeScript()
{
    log("Hello world from `invokeScript`");
}

function initializeScript()
{
    log("Hello world from `initializeScript`");
}

function uninitializeScript()
{
    log("Goodbye world from `uninitializeScript`");
}


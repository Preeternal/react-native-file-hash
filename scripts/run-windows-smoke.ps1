param(
    [Parameter(Mandatory = $true)]
    [string]$LogFile,
    [string]$PackageName = 'FileHashWindowsExample',
    [ValidateRange(1, 3600)]
    [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = 'Stop'
$LogFile = [System.IO.Path]::GetFullPath($LogFile)
Remove-Item -LiteralPath $LogFile -ErrorAction SilentlyContinue
$startedAt = Get-Date
$process = $null

# Activate the registered package so Windows resolves WinAppSDK and the native
# module dependencies in its package graph. Keep a process handle for exit checks.
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class FileHashSmokeActivation
{
    [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IApplicationActivationManager
    {
        [PreserveSig]
        int ActivateApplication(
            [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
            [MarshalAs(UnmanagedType.LPWStr)] string arguments,
            uint options, out uint processId);
    }

    public static Process Start(string appUserModelId, string arguments)
    {
        var manager = (IApplicationActivationManager)Activator.CreateInstance(
            Type.GetTypeFromCLSID(new Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c")));
        try
        {
            uint processId;
            // AO_NOERRORUI avoids an invisible modal dialog on a CI runner.
            Marshal.ThrowExceptionForHR(manager.ActivateApplication(
                appUserModelId, arguments, 2, out processId));
            var process = Process.GetProcessById((int)processId);
            var handle = process.Handle;
            return process;
        }
        finally
        {
            Marshal.ReleaseComObject(manager);
        }
    }
}
'@

try {
    $package = Get-AppxPackage -Name $PackageName | Select-Object -First 1
    if (-not $package) { throw "Package $PackageName is not registered" }
    $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
    $app = $manifest.Package.Applications.Application | Select-Object -First 1
    $executable = Join-Path $package.InstallLocation $app.Executable
    $bundle = Join-Path (Split-Path $executable) 'Bundle\index.windows.bundle'
    if (-not (Test-Path -LiteralPath $executable)) { throw "Missing packaged executable: $executable" }
    if (-not (Test-Path -LiteralPath $bundle)) { throw "Missing packaged JS bundle: $bundle" }

    $aumid = "$($package.PackageFamilyName)!$($app.Id)"
    Write-Host "Activating $aumid from $($package.InstallLocation)"
    $process = [FileHashSmokeActivation]::Start($aumid, "--file-hash-smoke-log `"$LogFile`"")
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
        throw "Windows hash smoke timed out after $TimeoutSeconds seconds"
    }
    $exitCode = $process.ExitCode
    Write-Host ('Smoke app exited with code {0} (0x{0:X8})' -f $exitCode)
    if ($exitCode -ne 0) { throw "Smoke app exited with code $exitCode" }
    if (-not (Test-Path -LiteralPath $LogFile)) { throw 'Smoke app exited without writing a log' }
    if (-not (Select-String -LiteralPath $LogFile -Pattern '^FILE_HASH_WINDOWS_SMOKE_PASS$' -Quiet)) {
        throw 'Smoke app exited without a PASS marker'
    }
} catch {
    $smokeError = $_
    # Loader failures can happen before WinMain; preserve the Windows error too.
    try {
        Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = $startedAt } -ErrorAction Stop |
            Where-Object { $_.Message -match 'FileHashWindowsExample|Microsoft.ReactNative|WinUI' } |
            Select-Object TimeCreated, ProviderName, Id, Message |
            Format-List | Out-String | Tee-Object -FilePath "$LogFile.events.log" | Write-Host
    } catch {
        Write-Warning "Could not read startup events: $_"
    }
    throw $smokeError
} finally {
    if ($null -ne $process) {
        if (-not $process.HasExited) {
            $process.Kill()
            $null = $process.WaitForExit(5000)
        }
        $process.Dispose()
    }
    if (Test-Path -LiteralPath $LogFile) { Get-Content -LiteralPath $LogFile }
}

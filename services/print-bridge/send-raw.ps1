# send-raw.ps1
# Envía bytes crudos ESC/POS a una impresora Windows por nombre via Spooler API (winspool.Drv).
# Uso: powershell -ExecutionPolicy Bypass -File send-raw.ps1 "Ticketera" "C:\ruta\archivo.bin"
param(
    [Parameter(Mandatory=$true)] [string]$PrinterName,
    [Parameter(Mandatory=$true)] [string]$FilePath
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WinSpooler {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPTStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPTStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPTStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO pDocInfo);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
}
"@

if (-not (Test-Path $FilePath)) {
    Write-Error "Archivo no encontrado: $FilePath"
    exit 1
}

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$hPrinter = [IntPtr]::Zero

if (-not [WinSpooler]::OpenPrinter($PrinterName, [ref]$hPrinter, [IntPtr]::Zero)) {
    $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    Write-Error "No se pudo abrir la impresora '$PrinterName'. Error Win32: $err"
    exit 1
}

try {
    $docInfo = New-Object WinSpooler+DOCINFO
    $docInfo.pDocName   = "ESC/POS Ticket"
    $docInfo.pDataType  = "RAW"

    [WinSpooler]::StartDocPrinter($hPrinter, 1, $docInfo) | Out-Null
    [WinSpooler]::StartPagePrinter($hPrinter) | Out-Null

    $pBytes  = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    $written = 0

    try {
        [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $pBytes, $bytes.Length)
        [WinSpooler]::WritePrinter($hPrinter, $pBytes, $bytes.Length, [ref]$written) | Out-Null
    } finally {
        [System.Runtime.InteropServices.Marshal]::FreeHGlobal($pBytes)
    }

    [WinSpooler]::EndPagePrinter($hPrinter) | Out-Null
    [WinSpooler]::EndDocPrinter($hPrinter)  | Out-Null
} finally {
    [WinSpooler]::ClosePrinter($hPrinter) | Out-Null
}

Write-Host "OK: $written bytes enviados a '$PrinterName'"
exit 0

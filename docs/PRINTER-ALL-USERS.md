# Instalar la ticketera para que la vea SYSTEM (todos los usuarios)

El print-bridge corre como `SYSTEM` vía tarea programada (arranca con Windows,
sin depender de que un usuario específico inicie sesión). Para que `SYSTEM`
pueda imprimir, la impresora debe quedar registrada como impresora **local
de máquina**, no como una conexión atada al perfil de un usuario.

> No existe un checkbox literal de "compartir para todos los usuarios" en
> impresoras locales USB — ese registro solo aplica a compartir por red hacia
> OTRAS PCs. Lo que realmente importa es **quién instala el driver**: si se
> instala con una cuenta Administradora (elevada), Windows la registra a
> nivel de máquina automáticamente y SYSTEM ya la ve. Si se instala con un
> usuario limitado, o queda como "conexión" (Point-and-Print) en vez de
> impresora local, se queda atada a esa sesión.

## Pasos (iguales en Windows 8 / 10 / 11, cambia solo la ruta del menú)

1. Conecta la impresora térmica por USB.
2. Inicia sesión con una cuenta **Administrador local** (no un usuario
   limitado) o ejecuta el instalador del driver con **"Ejecutar como
   Administrador"**.
3. Instala el driver del fabricante (o el genérico/texto de Windows si no
   hay uno específico) desde ahí.
4. Ábrela y agrégala manualmente si el fabricante no lo hizo solo:
   - **Windows 11**: Configuración → Bluetooth y dispositivos → Impresoras y
     escáneres → Agregar dispositivo.
   - **Windows 10**: Configuración → Dispositivos → Impresoras y escáneres →
     Agregar una impresora o escáner.
   - **Windows 8**: Panel de control → Dispositivos e impresoras → Agregar
     una impresora.
5. Asegúrate de elegir **"Agregar una impresora local"** (no "impresora de
   red, inalámbrica o Bluetooth" ni conectarte a una impresora compartida de
   otra PC) — así queda como objeto local del spooler, visible a todos los
   perfiles y a SYSTEM.

## Verificación directa (la que realmente confirma si SYSTEM la ve)

No confíes solo en `Get-Printer` corrido como usuario normal — eso no prueba
que SYSTEM tenga acceso. Para probarlo de verdad, usa **PsExec** (Sysinternals,
gratis, de Microsoft) para abrir una sesión como SYSTEM y consultar desde ahí:

```powershell
# Descarga PsExec si no lo tienes: https://learn.microsoft.com/sysinternals/downloads/psexec
psexec -s -i powershell
```

Dentro de esa consola (que corre como SYSTEM):
```powershell
Get-Printer | Select Name, Type, PortName
```

Si `TICKETERA` aparece ahí, SYSTEM la ve y el print-bridge va a poder
imprimir. Si no aparece, hay que reinstalar el driver como Administrador
(paso 2-3) — probablemente se instaló con un usuario sin privilegios o quedó
como conexión de red en vez de impresora local.

## Nota

Después de corregir la instalación de la impresora, corre de nuevo
`PrintBridge-Setup.exe` como Administrador (o solo reinicia la PC si ya
estaba instalado) para que la tarea `GrupoMetalicoEMF-PrintBridge` arranque
limpia y confirme conexión (`TASK_OK` en vez de `TASK_OK_NOT_RESPONDING`).

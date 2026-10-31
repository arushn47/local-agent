!ifndef BUILD_UNINSTALLER
  !include nsDialogs.nsh
  !define MUI_CUSTOMFUNCTION_ABORT localagentOnUserAbort
!endif
; LocalAgent's only installer extension: use the Windows ZIP/long-path extractor.
; Search the generated, hash-checked extraction overlay first. Other includes,
; registry, shortcuts, uninstaller generation and signing remain upstream.
!addincludedir "${PROJECT_DIR}\..\..\node_modules\app-builder-lib\templates\nsis"
!cd "${PROJECT_DIR}\..\..\.localagent\nsis"
!macro customHeader
  !ifndef BUILD_UNINSTALLER
    Var LocalAgentTransactionStarted
    Function .onVerifyInstDir
      Push $R7
      Push $R8
      StrLen $R7 $INSTDIR
      StrCpy $R8 $INSTDIR 2 1
      ${If} $R7 == 3
      ${AndIf} $R8 == ":\"
        StrCpy $R8 $INSTDIR 2
        StrCpy $INSTDIR "$R8\LocalAgent"
        ${If} $mui.DirectoryPage.Directory != 0
          SendMessage $mui.DirectoryPage.Directory ${WM_SETTEXT} 0 "STR:$INSTDIR"
        ${EndIf}
      ${EndIf}
      Pop $R8
      Pop $R7
    FunctionEnd
    Function localagentDirectoryShow
      ${NSD_CreateTimer} localagentDirectoryTick 200
    FunctionEnd
    Function localagentDirectoryLeave
      ${NSD_KillTimer} localagentDirectoryTick
    FunctionEnd
    Function localagentDirectoryTick
      Push $7
      System::Call 'user32::IsWindowVisible(p $mui.DirectoryPage.Directory) i .r7'
      ${If} $7 == 0
        ${NSD_KillTimer} localagentDirectoryTick
      ${Else}
        ${NSD_GetText} $mui.DirectoryPage.Directory $INSTDIR
        Call .onVerifyInstDir
      ${EndIf}
      Pop $7
    FunctionEnd
    Function localagentRecoverFailure
      ${If} ${FileExists} "$INSTDIR.transaction.json"
      ${AndIf} ${FileExists} "$PLUGINSDIR\localagent-tools\resources\node\node.exe"
        SetOutPath $TEMP
        nsExec::ExecToStack '"$PLUGINSDIR\localagent-tools\resources\node\node.exe" "$PLUGINSDIR\upgrade.cjs" recover "$INSTDIR"'
        Pop $R0
        Pop $R1
        ${If} $R0 != 0
          MessageBox MB_OK|MB_ICONSTOP "Automatic recovery is pending. Your prior payload and registration snapshot are retained. Run the documented recovery command before another install." /SD IDOK
        ${EndIf}
      ${EndIf}
    FunctionEnd
    Function .onInstFailed
      ${If} $LocalAgentTransactionStarted == 1
        Call localagentRecoverFailure
      ${EndIf}
    FunctionEnd
    Function localagentOnUserAbort
      ${If} $LocalAgentTransactionStarted == 1
        Call localagentRecoverFailure
      ${EndIf}
    FunctionEnd
  !endif
!macroend
!macro localagentDecompress
  ; Also guard silent installs, which do not display the directory page.
  Call .onVerifyInstDir
  File "/oname=$PLUGINSDIR\upgrade.cjs" "${PROJECT_DIR}\upgrade.cjs"
  File "/oname=$PLUGINSDIR\registration.cjs" "${PROJECT_DIR}\registration.cjs"
  File "/oname=$PLUGINSDIR\installer-recovery.cjs" "${PROJECT_DIR}\installer-recovery.cjs"
  StrCpy $R2 "$WINDIR\Sysnative\tar.exe"
  ${IfNot} ${FileExists} "$R2"
    StrCpy $R2 "$SYSDIR\tar.exe"
  ${EndIf}
  ${IfNot} ${FileExists} "$R2"
    MessageBox MB_OK|MB_ICONSTOP "LocalAgent requires Windows with the built-in tar.exe extractor." /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
  ; Load trusted Node from this installer, never execute a retained runtime.
  CreateDirectory "$PLUGINSDIR\localagent-tools"
  nsExec::ExecToStack '"$R2" -xf "$PLUGINSDIR\app-$packageArch.zip" -C "$PLUGINSDIR\localagent-tools" "resources/node/node.exe"'
  Pop $R0
  Pop $R1
  ${If} $R0 != 0
    MessageBox MB_OK|MB_ICONSTOP "LocalAgent could not load its bundled recovery tools. Existing files were not changed." /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
  SetOutPath $TEMP
  nsExec::ExecToStack '"$PLUGINSDIR\localagent-tools\resources\node\node.exe" "$PLUGINSDIR\installer-recovery.cjs" inspect "$INSTDIR" "$PLUGINSDIR\recovery-inspection.json"'
  Pop $R0
  Pop $R1
  ${If} $R0 == 0
    Goto localagentRecoveryContinue
  ${ElseIf} $R0 == 10
  ${OrIf} $R0 == 11
  ${OrIf} $R0 == 13
  ${OrIf} $R0 == 14
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$R1$\n$\nInstallation: $INSTDIR$\n$\nYes: move retained staging, rollback and journal material into a new dated recovery folder beside this installation, then continue. Nothing is deleted; the current application and user data stay in place.$\n$\nNo: cancel without changing files. To restore an older committed version instead, cancel and follow the recovery guide." /SD IDNO IDYES localagentRecoveryPreserve
    Goto localagentRecoveryAbort
  ${ElseIf} $R0 == 12
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "$R1$\n$\nInstallation: $INSTDIR$\n$\nYes: restore the journal's previous files and registration, preserve the unsuccessful candidate in a dated recovery folder, then retry.$\n$\nNo: cancel without changing recovery material. Projects, settings, conversations and credentials are outside this transaction." /SD IDNO IDYES localagentRecoveryRestore
    Goto localagentRecoveryAbort
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "$R1$\n$\nInstallation: $INSTDIR$\nRecovery siblings: .stage, .rollback, .transaction.json$\n$\nNo files were deleted or overwritten. Keep this material for review; see docs/RELEASE.md." /SD IDOK
    Goto localagentRecoveryAbort
  ${EndIf}
  localagentRecoveryPreserve:
    nsExec::ExecToStack '"$PLUGINSDIR\localagent-tools\resources\node\node.exe" "$PLUGINSDIR\installer-recovery.cjs" preserve "$INSTDIR"'
    Goto localagentRecoveryResult
  localagentRecoveryRestore:
    nsExec::ExecToStack '"$PLUGINSDIR\localagent-tools\resources\node\node.exe" "$PLUGINSDIR\installer-recovery.cjs" restore "$INSTDIR"'
  localagentRecoveryResult:
    Pop $R0
    Pop $R1
    ${If} $R0 != 0
      MessageBox MB_OK|MB_ICONSTOP "$R1$\n$\nInstallation stopped. Recovery material is retained; do not delete it." /SD IDOK
      Goto localagentRecoveryAbort
    ${EndIf}
    DetailPrint "$R1"
    MessageBox MB_OK|MB_ICONINFORMATION "$R1$\n$\nThe installer will now retry using a new staging folder." /SD IDOK
    Goto localagentRecoveryContinue
  localagentRecoveryAbort:
    SetErrorLevel 1
    Quit
  localagentRecoveryContinue:
  CreateDirectory "$INSTDIR.stage"
  nsExec::ExecToStack '"$R2" -xf "$PLUGINSDIR\app-$packageArch.zip" -C "$INSTDIR.stage"'
  Pop $R0
  Pop $R1
  ${If} $R0 != 0
    MessageBox MB_OK|MB_ICONSTOP "LocalAgent extraction failed (error $R0). Partial files remain at $INSTDIR.stage. Existing installation and user data were not replaced. On retry, choose Preserve to retain these files and extract again." /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
  SetOutPath $TEMP
  StrCpy $LocalAgentTransactionStarted 1
  nsExec::ExecToStack '"$PLUGINSDIR\localagent-tools\resources\node\node.exe" "$PLUGINSDIR\upgrade.cjs" install "$INSTDIR"'
  Pop $R0
  Pop $R1
  ${If} $R0 != 0
    MessageBox MB_OK|MB_ICONSTOP "LocalAgent could not validate or activate the update: $R1$\n$\nPrevious application and recovery material are retained at $INSTDIR and its recovery siblings. Close LocalAgent, retry, and review the recovery explanation." /SD IDOK
    SetErrorLevel 1
    Quit
  ${EndIf}
  SetOutPath $INSTDIR
!macroend

!macro customInstall
  nsExec::ExecToStack '"$PLUGINSDIR\localagent-tools\resources\node\node.exe" "$PLUGINSDIR\upgrade.cjs" commit "$INSTDIR"'
  Pop $R0
  Pop $R1
  ${If} $R0 != 0
    Call localagentRecoverFailure
    SetErrorLevel 1
    Abort "LocalAgent registration commit failed; recovery was requested."
  ${EndIf}
  ; A completed install must not roll back when the finish window closes.
  StrCpy $LocalAgentTransactionStarted 0
!macroend

; NSIS RMDir leaves paths over 259 characters. The bundled Node process removes
; only its validated sibling runtime payload before the normal shallow cleanup.
; Keep upstream's atomic upgrade behavior; upgrade/rollback remains a release gate.
!macro customUnInstall
  ${IfNot} ${isUpdated}
    InitPluginsDir
    File "/oname=$PLUGINSDIR\localagent-uninstall.cjs" "${PROJECT_DIR}\uninstall.cjs"
    nsExec::ExecToStack '"$INSTDIR\resources\node\node.exe" "$PLUGINSDIR\localagent-uninstall.cjs" "$INSTDIR\resources\runtime"'
    Pop $R0
    Pop $R1
    ${If} $R0 != 0
      MessageBox MB_OK|MB_ICONSTOP "LocalAgent could not remove its runtime. Close LocalAgent and try uninstalling again." /SD IDOK
      SetErrorLevel 1
      Abort "Runtime payload cleanup failed"
    ${EndIf}
  ${EndIf}
!macroend

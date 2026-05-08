#!/usr/bin/env python3
"""
Mass-migrate read/write-sites i app.js från legacy state-paths till
flat namespaces (state.ui.*, state.selection.*, state.status.*, state.prefs.*).

View-Proxy:erna är fully transparent — view.X läser/skriver SAMMA storage som
direct path access, så migrationen är beteendebevarande.

Skriver ut diff-stat och uppdaterar app.js direkt.
"""
import re, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
APP_JS = os.path.join(ROOT, 'public/major-arcana-preview/app.js')

# Mappings — ORDNA längsta path först för att undvika partial-match
UI = {
    'queueInlinePanelOpen': ['runtime', 'queueInlinePanel', 'open'],
    'queueHistoryOpen': ['runtime', 'queueHistory', 'open'],
    'truthWorklistViewHidden': ['runtime', 'truthWorklistView', 'hidden'],
    'queueCategoriesCompact': ['runtime', 'queueCategoriesCompact'],
    'historyExpanded': ['runtime', 'historyExpanded'],
    'activeFocusSection': ['runtime', 'activeFocusSection'],
    'noteModeOpen': ['noteMode', 'open'],
    'macroModalOpen': ['macroModal', 'open'],
    'settingsProfileModalOpen': ['settingsProfileModal', 'open'],
    'confirmDialogOpen': ['confirmDialog', 'open'],
    'pendingMailFeedDeleteActive': ['pendingMailFeedDelete', 'active'],
    'moreMenuOpen': ['moreMenuOpen'],
    'mailboxAdminOpen': ['mailboxAdminOpen'],
    'mailboxAdminEditingId': ['mailboxAdminEditingId'],
    'automationCollaborationOpen': ['automationCollaborationOpen'],
    'automationRailCollapsed': ['automationRailCollapsed'],
    'customerMergeModalOpen': ['customerMergeModalOpen'],
    'customerSettingsOpen': ['customerSettingsOpen'],
    'customerSuggestionsHidden': ['customerSuggestionsHidden'],
    'view': ['view'],
}
SEL = {
    'historyConversationId': ['runtime', 'queueHistory', 'selectedConversationId'],
    'mailFeedKeyLater': ['selectedMailFeedKey', 'later'],
    'mailFeedKeySent': ['selectedMailFeedKey', 'sent'],
    'historyContextThreadId': ['runtime', 'historyContextThreadId'],
    'threadId': ['runtime', 'selectedThreadId'],
    'mailboxIds': ['runtime', 'selectedMailboxIds'],
    'ownerKey': ['runtime', 'selectedOwnerKey'],
    'laneId': ['runtime', 'activeLaneId'],
    'customerIdentity': ['selectedCustomerIdentity'],
    'analyticsPeriod': ['selectedAnalyticsPeriod'],
    'automationLibrary': ['selectedAutomationLibrary'],
    'automationNode': ['selectedAutomationNode'],
    'automationSection': ['selectedAutomationSection'],
    'automationTemplate': ['selectedAutomationTemplate'],
    'automationVersion': ['selectedAutomationVersion'],
    'automationAutopilotProposal': ['selectedAutomationAutopilotProposal'],
    'integrationCategory': ['selectedIntegrationCategory'],
    'showcaseFeature': ['selectedShowcaseFeature'],
    'customerMergePrimaryKey': ['customerMergePrimaryKey'],
}
STATUS = {
    'queueHistoryLoading': ['runtime', 'queueHistory', 'loading'],
    'queueHistoryLoaded': ['runtime', 'queueHistory', 'loaded'],
    'queueHistoryError': ['runtime', 'queueHistory', 'error'],
    'truthWorklistViewLoading': ['runtime', 'truthWorklistView', 'loading'],
    'truthWorklistViewLoaded': ['runtime', 'truthWorklistView', 'loaded'],
    'truthWorklistViewAuthRequired': ['runtime', 'truthWorklistView', 'authRequired'],
    'truthWorklistViewError': ['runtime', 'truthWorklistView', 'error'],
    'backgroundRefreshSelectedThreadId': ['runtime', 'backgroundRefreshSelectedThreadId'],
    'hasReachedSteadyState': ['runtime', 'hasReachedSteadyState'],
    'hasRemovedRuntimeLoading': ['runtime', 'hasRemovedRuntimeLoading'],
    'authRecoveryArmed': ['runtime', 'authRecoveryArmed'],
    'pendingFullRefresh': ['runtime', 'pendingFullRefresh'],
    'isBackgroundRefresh': ['runtime', 'isBackgroundRefresh'],
    'offlineWorkingSetSource': ['runtime', 'offlineWorkingSetSource'],
    'offlineWorkingSetMeta': ['runtime', 'offlineWorkingSetMeta'],
    'historyDeleting': ['runtime', 'historyDeleting'],
    'deletingThreadId': ['runtime', 'deletingThreadId'],
    'restoringMail': ['runtime', 'restoringMail'],
    'lastSyncAt': ['runtime', 'lastSyncAt'],
    'authRequired': ['runtime', 'authRequired'],
    'loading': ['runtime', 'loading'],
    'loaded': ['runtime', 'loaded'],
    'mode': ['runtime', 'mode'],
    'live': ['runtime', 'live'],
    'offline': ['runtime', 'offline'],
    'error': ['runtime', 'error'],
    'bootstrapped': ['bootstrapped'],
    'bootstrapError': ['bootstrapError'],
}
PREFS = {
    'graphReadConnectorAvailable': ['runtime', 'graphReadConnectorAvailable'],
    'defaultSignatureProfile': ['runtime', 'defaultSignatureProfile'],
    'defaultSenderMailbox': ['runtime', 'defaultSenderMailbox'],
    'preferredMailboxId': ['runtime', 'preferredMailboxId'],
    'mailboxScopePinned': ['runtime', 'mailboxScopePinned'],
    'graphReadEnabled': ['runtime', 'graphReadEnabled'],
    'deleteEnabled': ['runtime', 'deleteEnabled'],
    'sendEnabled': ['runtime', 'sendEnabled'],
    'themeChoice': ['settingsRuntime', 'choices', 'theme'],
    'densityChoice': ['settingsRuntime', 'choices', 'density'],
    'profileName': ['settingsRuntime', 'profileName'],
    'profileEmail': ['settingsRuntime', 'profileEmail'],
    'automationAutopilotEnabled': ['automationAutopilotEnabled'],
    'workspacePrefsApplied': ['workspacePrefsApplied'],
    'automationScale': ['automationScale'],
}

def make_replacements(view_name, mapping):
    """Returnerar lista av (regex, replacement)-tuples för en view, sorted longest-first."""
    items = sorted(mapping.items(), key=lambda x: -len(x[1]))
    return [(
        re.compile(r'(?<![\w.])state\.' + r'\.'.join(re.escape(p) for p in path) + r'(?![\w])'),
        f'state.{view_name}.{key}',
    ) for key, path in items]

def main():
    with open(APP_JS) as f:
        src = f.read()
    original = src

    total_replaces = 0
    per_view = {}
    for view_name, mapping in [('ui', UI), ('selection', SEL), ('status', STATUS), ('prefs', PREFS)]:
        view_replaces = 0
        for pat, repl in make_replacements(view_name, mapping):
            new_src, n = pat.subn(repl, src)
            view_replaces += n
            src = new_src
        per_view[view_name] = view_replaces
        total_replaces += view_replaces

    # SAFETY: skydda __UI_KEY_PATHS-deklarationen och liknande från att muteras
    # (sökord 'state.ui.X' inom mapping-deklaration skulle vara fel)
    # Men vi söker bara 'state.X' så map-deklaration är säker (uses ['X', 'Y'] arrays).

    # Skydda interna proxy-impl funktioner från att förfalskas.
    # __readUiPath / __writeUiPath använder __stateInternal direkt → OK.

    if src == original:
        print('Inga förändringar.')
        return

    with open(APP_JS, 'w') as f:
        f.write(src)

    print(f'Total ersättningar: {total_replaces}')
    for view, n in per_view.items():
        print(f'  state.{view}.*: {n}')
    print(f'Skrev till {APP_JS}')

if __name__ == '__main__':
    main()

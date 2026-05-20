#!/usr/bin/env python3
"""Purge legacy admin CCO; keep embed-only paths."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ADMIN_JS = ROOT / "public" / "admin.js"
ADMIN_HTML = ROOT / "public" / "admin.html"


def delete_line_ranges(lines: list[str], ranges: list[tuple[int, int]]) -> list[str]:
    """Delete 1-based inclusive ranges; process highest line first."""
    for start, end in sorted(ranges, key=lambda r: r[0], reverse=True):
        del lines[start - 1 : end]
    return lines


def patch_admin_js(text: str) -> str:
    lines = text.splitlines(keepends=True)
    original_len = len(lines)

    delete_line_ranges(
        lines,
        [
            (262, 353),  # cco debug/session readers
            (403, 403),  # initialCcoWorkspaceSession
            (405, 947),  # sanitize* block
            (1076, 1258),  # state cco* fields + sla fix
            (1338, 1342),  # legacy els after embed
            (1344, 1459),  # more legacy els before runCcoInboxBtn
            (1460, 1460),  # runCcoInboxBtn
            (1461, 1622),  # rest legacy cco els
            (3506, 3521),  # mountCcoHeaderNav
            (3930, 3937),  # isCcoWorkspaceActive / isCcoNextWorkspaceActive
            (3964, 4031),  # auto refresh
            (5660, 5775),  # persist/sync/setSelected cco
            (5970, 5985),  # pruneLegacyCcoUnansweredNavButtons
            (8976, 27820),  # legacy cco implementation block
            (30227, 31479),  # legacy cco + cco-next event listeners
        ],
    )

    text = "".join(lines)

    replacements = [
        (
            r"  const CCO_AUTO_REFRESH_BOOT_MS = 1200;\n"
            r"  const CCO_AUTO_REFRESH_INTERVAL_MS = 45000;\n"
            r"  const CCO_AUTO_REFRESH_RETRY_MS = 12000;\n",
            "",
        ),
        (
            r"  const CCO_NEXT_PRIMARY_PATH = '/cco-next';\n"
            r"  const CCO_UNANSWERED_PRIMARY_PATH = '/unanswered';\n",
            "",
        ),
        (
            r"  const CCO_THREAD_QUERY_PARAM = 'thread';\n"
            r"  const CCO_WORKSPACE_SESSION_KEY = 'ARCANA_CCO_WORKSPACE_STATE';\n"
            r"  const CCO_LAST_SEEN_AT_KEY = 'ARCANA_CCO_LAST_SEEN_AT';\n"
            r"  const CCO_ONBOARDING_COMPLETED_KEY = 'cco-onboarding-completed';\n",
            "",
        ),
        (
            r"  function isCcoNextRoutePath\(pathname = ''\) \{\n"
            r"    const normalized = String\(pathname \|\| ''\)\.trim\(\)\.toLowerCase\(\);\n"
            r"    return normalized\.endsWith\('/cco-next'\) \|\| normalized\.endsWith\('/admin/cco-next'\);\n"
            r"  \}\n\n",
            "",
        ),
        (r"      mountCcoHeaderNav\(\);\n", ""),
        (r"      clearCcoAutoRefreshTimer\(\);\n", ""),
        (r"    mountCcoHeaderNav\(\);\n", ""),
        (
            r"    try \{\n      sessionStorage\.removeItem\(CCO_WORKSPACE_SESSION_KEY\);\n    \} catch \{\n      // Ignorera sessionStorage-fel\n    \}\n",
            "",
        ),
        (
            r"    if \(els\.ccoInboxSearchInput\) els\.ccoInboxSearchInput\.value = '';\n"
            r"    if \(els\.ccoInboxShowSystemToggle\) els\.ccoInboxShowSystemToggle\.checked = false;\n"
            r"    if \(els\.ccoInboxSearchMeta\) els\.ccoInboxSearchMeta\.textContent = '';\n",
            "",
        ),
        (r"    renderCcoInbox\(null\);\n    setStatus\(els\.ccoInboxStatus, ''\);\n", ""),
        (
            r",\n      loadCcoInboxBrief\(\{ quiet: true \}\)",
            "",
        ),
        (
            r"  function resolveRefreshScope\(\) \{\n"
            r"    return state\.activeSectionGroup === 'ccoWorkspaceSection' \? 'cco' : 'all';\n"
            r"  \}\n\n\n",
            "",
        ),
        (
            r"  async function refreshAll\(\{ scope = 'all' \} = \{\}\) \{\n"
            r"    const normalizedScope = String\(scope \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'cco' \? 'cco' : 'all';\n"
            r"    await loadSessionProfile\(\);\n"
            r"    await loadTenants\(\);\n"
            r"    if \(normalizedScope === 'cco'\) \{\n"
            r"      if \(canTemplateWrite\(\)\) \{\n"
            r"        await runCcoInboxBrief\(\{ quiet: true, forceLoading: true \}\);\n"
            r"      \} else \{\n"
            r"        await loadCcoInboxBrief\(\{ quiet: true \}\);\n"
            r"      \}\n"
            r"      return;\n"
            r"    \}\n",
            "  async function refreshAll({ scope = 'all' } = {}) {\n    void scope;\n    await loadSessionProfile();\n    await loadTenants();\n",
        ),
        (
            r"  function syncWorkspaceTheme\(groupId\) \{\n"
            r"    const normalized = String\(groupId \|\| ''\)\.trim\(\);\n"
            r"    const ccoEmbedActive =\n"
            r"      normalized === 'ccoWorkspaceSection' && isCcoEmbedMode\(\);\n"
            r"    const ccoNextModeActive =\n"
            r"      normalized === 'ccoNextWorkspaceSection' \|\| isCcoNextRoutePath\(window\.location\.pathname \|\| ''\);\n"
            r"    const ccoLightModeActive =\n"
            r"      ccoNextModeActive \|\|\n"
            r"      isCcoRoutePath\(window\.location\.pathname \|\| ''\) \|\|\n"
            r"      isCcoNextRoutePath\(window\.location\.pathname \|\| ''\) \|\|\n"
            r"      \(normalized === 'ccoWorkspaceSection' && !isCcoEmbedMode\(\)\);\n"
            r"    const hideAdminChrome = ccoEmbedActive \|\| ccoNextModeActive;\n\n"
            r"    document\.body\.classList\.toggle\('cco-preview-embed-route', ccoEmbedActive\);\n"
            r"    document\.body\.classList\.toggle\('cco-light-mode', ccoLightModeActive\);\n"
            r"    document\.body\.classList\.toggle\('cco-next-preview-route', ccoNextModeActive\);\n"
            r"    document\.body\.classList\.remove\('cco-compact-header'\);\n",
            "  function syncWorkspaceTheme(groupId) {\n    const normalized = String(groupId || '').trim();\n    const ccoEmbedActive = normalized === 'ccoWorkspaceSection' && isCcoEmbedMode();\n    const hideAdminChrome = ccoEmbedActive;\n\n    document.body.classList.toggle('cco-preview-embed-route', ccoEmbedActive);\n    document.body.classList.remove('cco-light-mode', 'cco-next-preview-route', 'cco-compact-header');\n",
        ),
        (
            r"  function setActiveSectionGroup\(nextGroupId, options = \{\}\) \{\n"
            r"    const previousGroupId = state\.activeSectionGroup;\n"
            r"    const groupId = resolveSectionGroupTarget\(nextGroupId\);\n"
            r"    const enteringCco =\n"
            r"      String\(groupId \|\| ''\)\.trim\(\) === 'ccoWorkspaceSection' &&\n"
            r"      String\(previousGroupId \|\| ''\)\.trim\(\) !== 'ccoWorkspaceSection';\n"
            r"    const enteringCcoNext =\n"
            r"      String\(groupId \|\| ''\)\.trim\(\) === 'ccoNextWorkspaceSection' &&\n"
            r"      String\(previousGroupId \|\| ''\)\.trim\(\) !== 'ccoNextWorkspaceSection';\n"
            r"    const leavingCco =\n"
            r"      String\(groupId \|\| ''\)\.trim\(\) !== 'ccoWorkspaceSection' &&\n"
            r"      String\(previousGroupId \|\| ''\)\.trim\(\) === 'ccoWorkspaceSection';\n"
            r"    const leavingCcoNext =\n"
            r"      String\(groupId \|\| ''\)\.trim\(\) !== 'ccoNextWorkspaceSection' &&\n"
            r"      String\(previousGroupId \|\| ''\)\.trim\(\) === 'ccoNextWorkspaceSection';\n",
            "  function setActiveSectionGroup(nextGroupId, options = {}) {\n    const previousGroupId = state.activeSectionGroup;\n    const groupId = resolveSectionGroupTarget(nextGroupId);\n    const enteringCco =\n      String(groupId || '').trim() === 'ccoWorkspaceSection' &&\n      String(previousGroupId || '').trim() !== 'ccoWorkspaceSection';\n    const leavingCco =\n      String(groupId || '').trim() !== 'ccoWorkspaceSection' &&\n      String(previousGroupId || '').trim() === 'ccoWorkspaceSection';\n",
        ),
        (
            r"    if \(enteringCco\) \{\n"
            r"      ensureCcoPreviewEmbed\(\);\n"
            r"      state\.ccoAdaptiveFocusShowAll = false;\n"
            r"      state\.ccoFocusWorkloadMinutes = 0;\n"
            r"      hideCcoSoftBreakPanel\(\);\n"
            r"      postCcoUsageEvent\('workspace_open', \{\n"
            r"        route: '/admin#cco',\n"
            r"        workspaceId: 'cco',\n"
            r"      \}\);\n"
            r"      if \(!isCcoEmbedMode\(\)\) \{\n"
            r"        maybeShowCcoOnboarding\(\);\n"
            r"      \}\n"
            r"    \}\n"
            r"    if \(enteringCcoNext\) \{\n"
            r"      state\.ccoAdaptiveFocusShowAll = false;\n"
            r"      state\.ccoFocusWorkloadMinutes = 0;\n"
            r"      hideCcoSoftBreakPanel\(\);\n"
            r"    \}\n"
            r"    if \(leavingCco\) \{\n"
            r"      if \(isCcoEmbedMode\(\)\) \{\n"
            r"        teardownCcoPreviewEmbed\(\);\n"
            r"      \}\n"
            r"    \}\n"
            r"    if \(leavingCco \|\| leavingCcoNext\) \{\n"
            r"      state\.ccoLastSeenAtMs = Date\.now\(\);\n"
            r"      state\.ccoSeenConversationIds = \{\};\n"
            r"      persistCcoLastSeenAtMs\(state\.ccoLastSeenAtMs\);\n"
            r"      persistCcoWorkspaceSessionState\(\);\n"
            r"    \}\n"
            r"    const shouldImmediateCcoRefresh =\n"
            r"      isCcoSurfaceActive\(\) && \(\(enteringCco \|\| enteringCcoNext\) \|\| !state\.ccoInboxData\);\n"
            r"    syncCcoAutoRefresh\(\{ immediate: shouldImmediateCcoRefresh \}\);\n",
            "    if (enteringCco) {\n      ensureCcoPreviewEmbed();\n    }\n    if (leavingCco && isCcoEmbedMode()) {\n      teardownCcoPreviewEmbed();\n    }\n",
        ),
        (
            r"  function setActiveSectionNav\(targetId\) \{\n"
            r"    if \(!els\.sectionNav\) return;\n"
            r"    pruneLegacyCcoUnansweredNavButtons\(\);\n"
            r"    const resolvedTargetId = resolveSectionNavTarget\(targetId\);\n"
            r"    const sectionNavTarget =\n"
            r"      resolvedTargetId === 'ccoNextWorkspaceSection' \? 'ccoWorkspaceSection' : resolvedTargetId;\n"
            r"    const ccoViewMode = sanitizeCcoViewMode\(state\.ccoInboxViewMode\);\n"
            r"    els\.sectionNav\.querySelectorAll\('\.sectionNavBtn'\)\.forEach\(\(button\) => \{\n"
            r"      const currentTarget = String\(button\.getAttribute\('data-target'\) \|\| ''\)\.trim\(\);\n"
            r"      if \(!currentTarget \|\| currentTarget !== sectionNavTarget\) \{\n"
            r"        button\.classList\.remove\('active'\);\n"
            r"        return;\n"
            r"      \}\n"
            r"      if \(currentTarget === 'ccoWorkspaceSection'\) \{\n"
            r"        const buttonView = sanitizeCcoViewMode\(button\.getAttribute\('data-cco-view'\) \|\| 'all'\);\n"
            r"        button\.classList\.toggle\('active', buttonView === ccoViewMode\);\n"
            r"        return;\n"
            r"      \}\n"
            r"      button\.classList\.add\('active'\);\n"
            r"    \}\);\n"
            r"  \}",
            """  function setActiveSectionNav(targetId) {
    if (!els.sectionNav) return;
    const resolvedTargetId = resolveSectionNavTarget(targetId);
    els.sectionNav.querySelectorAll('.sectionNavBtn').forEach((button) => {
      const currentTarget = String(button.getAttribute('data-target') || '').trim();
      button.classList.toggle('active', Boolean(currentTarget && currentTarget === resolvedTargetId));
    });
  }""",
        ),
        (
            r"  function resolveInitialSectionGroup\(\) \{\n"
            r"    if \(isCcoNextRoutePath\(window\.location\.pathname \|\| ''\)\)\) \{\n"
            r"      return 'ccoNextWorkspaceSection';\n"
            r"    \}\n"
            r"    if \(isCcoRoutePath\(window\.location\.pathname \|\| ''\)\)\) \{\n"
            r"      return 'ccoWorkspaceSection';\n"
            r"    \}\n",
            "  function resolveInitialSectionGroup() {\n    if (isCcoRoutePath(window.location.pathname || '')) {\n      return 'ccoWorkspaceSection';\n    }\n",
        ),
        (
            r"    if \(normalized === 'ccoNextWorkspaceSection'\) \{\n"
            r"      return CCO_NEXT_PRIMARY_PATH;\n"
            r"    \}\n",
            "",
        ),
        (
            r"  window\.addEventListener\('beforeunload', \(\) => \{\n"
            r"    if \(isCcoSurfaceActive\(\)\) \{\n"
            r"      state\.ccoLastSeenAtMs = Date\.now\(\);\n"
            r"      persistCcoLastSeenAtMs\(state\.ccoLastSeenAtMs\);\n"
            r"    \}\n"
            r"    stopDashboardStream\(\{ resetRetry: false \}\);\n"
            r"    clearCcoAutoRefreshTimer\(\);\n"
            r"  \}\);",
            "  window.addEventListener('beforeunload', () => {\n    stopDashboardStream({ resetRetry: false });\n  });",
        ),
        (
            r"  document\.addEventListener\('visibilitychange', \(\) => \{\n"
            r"    if \(document\.visibilityState === 'hidden'\) \{\n"
            r"      clearCcoAutoRefreshTimer\(\);\n"
            r"      return;\n"
            r"    \}\n"
            r"    syncCcoAutoRefresh\(\{ immediate: isCcoSurfaceActive\(\) \}\);\n"
            r"  \}\);\n"
            r"  mountCcoHeaderNav\(\);\n",
            "",
        ),
        (
            r"    if \(isCcoNextWorkspaceActive\(\)\) \{\n"
            r"      renderCcoNextPreview\(\);\n"
            r"    \}\n",
            "",
        ),
        (r"  let ccoColumnResizeState = null;\n\n", ""),
    ]

    for old, new in replacements:
        text, n = re.subn(old, new, text, count=1)
        if n == 0 and old.strip().startswith("function"):
            # multiline replacements may need re.DOTALL
            text, n = re.subn(old, new, text, count=1, flags=re.DOTALL)

    # Remove orphan calls to deleted symbols
    orphan_patterns = [
        r"\n\s*mountCcoHeaderNav\(\);",
        r"\n\s*clearCcoAutoRefreshTimer\(\);",
        r"\n\s*syncCcoAutoRefresh\([^)]*\);",
        r"\n\s*persistCcoWorkspaceSessionState\(\);",
        r"\n\s*pruneLegacyCcoUnansweredNavButtons\(\);",
    ]
    for pat in orphan_patterns:
        text = re.sub(pat, "", text)

    print(f"admin.js lines: {original_len} -> {text.count(chr(10)) + 1}")
    return text


def main() -> None:
    js = ADMIN_JS.read_text(encoding="utf-8")
    js_out = patch_admin_js(js)
    ADMIN_JS.write_text(js_out, encoding="utf-8")

    html = ADMIN_HTML.read_text(encoding="utf-8")
    html_lines = html.splitlines(keepends=True)
    html_orig = len(html_lines)
    delete_line_ranges(
        html_lines,
        [
            (1494, 1519),
            (1588, 5682),
            (6297, 6850),
            (6975, 6984),
            (7013, 7015),
        ],
    )
    html_out = "".join(html_lines)
    html_out = re.sub(
        r"\n    body\.cco-light-mode \.cco-preview-embed-section \{\n      background: transparent;\n    \}\n",
        "\n",
        html_out,
        count=1,
    )
    ADMIN_HTML.write_text(html_out, encoding="utf-8")
    print(f"admin.html lines: {html_orig} -> {html_out.count(chr(10)) + 1}")


if __name__ == "__main__":
    main()

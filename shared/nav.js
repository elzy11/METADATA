/* ============================================================
   H / N / B keyboard navigation — shared by every page.
   Include at the bottom of <body>:  <script src="shared/nav.js"></script>
   To change the page order, edit ONLY this file.
   Also captures the Prolific ID from the URL (?PROLIFIC_PID=...)
   on whichever page a participant lands on first.
   ============================================================ */
(function () {
  /* ---- Prolific ID safety net ---- */
  try {
    const pid = new URLSearchParams(location.search).get("PROLIFIC_PID");
    if (pid) sessionStorage.setItem("md_prolific", pid);
  } catch (e) {}

  const ORDER = [
    "index.html",
    "intro-login.html",
    "pre-survey.html",
    "marketintro.html",
    "market.html",
    "treeintro.html",
    "tree.html",
    "spaceintro.html",
    "space.html",
    "end-survey.html",
    "temp-thanks.html",
    "data-community.html",
  ];
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    const here = location.pathname.split("/").pop() || "index.html";
    const i = Math.max(0, ORDER.indexOf(here));
    const k = e.key.toLowerCase();
    if (k === "h") location.href = ORDER[0];
    else if (k === "n") location.href = ORDER[(i + 1) % ORDER.length];
    else if (k === "b") location.href = ORDER[(i - 1 + ORDER.length) % ORDER.length];
  });
})();

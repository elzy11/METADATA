/* ============================================================
   H / N / B keyboard navigation 
   at the bottom of <body>:  <script src="shared/nav.js"></script>
   ============================================================ */
(function () {
  const ORDER = [
    "index.html",
    "market.html",
    "space.html",
    "tree.html",
    "metadata-login.html",
    "metadata-survey.html",
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

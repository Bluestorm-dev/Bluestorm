// js/app.js
import { initRouter, navigate } from "./router.js";
import { initBottomNav, setActiveNav } from "./components/bottomNav.js";

const $ = (sel, root = document) => root.querySelector(sel);

function setTitleAndSubtitle(title) {
  document.title = title ? `${title} — BlueStorm` : "BlueStorm";
  const sub = $("#topbarSubtitle");
  if (sub) sub.textContent = title || "BlueStorm";
}

export function initApp() {
  // Mount bottom nav (index.html => <footer id="bottomNav">)
  const navMount = $("#bottomNav");
  if (navMount) {
    initBottomNav(navMount, {
      onNavigate: (_routeKey, href) => {
        // ex: "#/journal" => "/journal"
        const path = href.startsWith("#") ? href.slice(1) : href;
        navigate(path);
      },
    });
  } else {
    console.warn("bottomNav mount (#bottomNav) introuvable (index.html)");
  }

  initRouter({
    onRouteChange: ({ route, title }) => {
      setActiveNav(route);
      setTitleAndSubtitle(title);
      window.scrollTo({ top: 0, behavior: "instant" });
    },
  });
}

initApp();

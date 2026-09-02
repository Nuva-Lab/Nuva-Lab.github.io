document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  if (!link || typeof gtag !== "function") return;

  const href = link.href;
  const label = link.textContent.trim().replace(/\s+/g, " ").slice(0, 100);

  if (href.startsWith("mailto:")) {
    gtag("event", "generate_lead", {
      method: "email",
      link_text: label,
      page_location: window.location.href
    });
    return;
  }

  if (link.origin !== window.location.origin) {
    gtag("event", "click", {
      link_url: href,
      link_domain: link.hostname,
      link_text: label,
      outbound: true
    });
  }
});

const lazyVideos = [...document.querySelectorAll("video[data-src]")];

if (lazyVideos.length) {
  const loadVideo = (video) => {
    if (video.src || !video.dataset.src) return;
    video.src = video.dataset.src;
    video.load();
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const video = entry.target;
      loadVideo(video);
      video.play().catch(() => {});
      observer.unobserve(video);
    });
  }, { rootMargin: "300px 0px" });

  lazyVideos.forEach((video) => observer.observe(video));
}

const header = document.querySelector(".site-header, .page-header");

if (header) {
  const mobileMenu = document.createElement("details");
  mobileMenu.className = "mobile-menu";
  mobileMenu.innerHTML = `
    <summary aria-label="Open navigation" title="Menu">
      <span aria-hidden="true"></span>
    </summary>
    <nav aria-label="Mobile navigation">
      <a href="/fasth3/">FastH3</a>
      <a href="/blog.html">Blog</a>
      <a href="mailto:info@nuvalab.ai">Contact</a>
    </nav>
  `;
  mobileMenu.addEventListener("click", (event) => {
    if (event.target.closest("a")) mobileMenu.removeAttribute("open");
  });
  header.append(mobileMenu);
}

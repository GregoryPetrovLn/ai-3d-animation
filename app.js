const VIDEO_URL = "./headphones.mp4";

const canvas = document.querySelector("#webgl-canvas");
const fallbackVideo = document.querySelector("#fallback-video");
const hero = document.querySelector(".hero");
const scrollSpace = document.querySelector(".scroll-space");
const workflowSection = document.querySelector(".workflow-builder");
const workflowGrid = document.querySelector(".workflow-grid");
const useCasesSection = document.querySelector(".use-cases");
const useCasesInner = document.querySelector(".use-cases-inner");

let scene = null;
let camera = null;
let renderer = null;
let plane = null;
let videoTexture = null;
let threeReady = false;

fallbackVideo.src = VIDEO_URL;
fallbackVideo.muted = true;
fallbackVideo.playsInline = true;
fallbackVideo.preload = "auto";
fallbackVideo.pause();

if (window.THREE && canvas) {
  try {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 3;

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    videoTexture = new THREE.VideoTexture(fallbackVideo);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;

    const material = new THREE.MeshBasicMaterial({
      map: videoTexture,
      toneMapped: false,
    });
    const geometry = new THREE.PlaneGeometry(1, 1);
    plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    threeReady = true;
    document.body.classList.add("three-ready");
  } catch (_error) {
    threeReady = false;
  }
}

let duration = 1;
let targetTime = 0;
let displayedTime = 0;
let canScrub = false;
const SCROLL_SPEED_FACTOR = 0.6;
const SMOOTHING_RESPONSE = 12;
const MAX_SEEK_SPEED = 2.4;
const SEEK_EPSILON = 1 / 600;
const FRAME_RATE_HINT = 30;
const FRAME_STEP = 1 / FRAME_RATE_HINT;
const SEEK_INTERVAL_MS = 1000 / 30;
const SCROLL_EARLY_BOOST_POWER = 0.72;
const HERO_PARALLAX_PX = 22;
const MOBILE_BREAKPOINT_PX = 620;
let lastFrameTimeMs = performance.now();
let lastSeekAtMs = 0;

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function updateHeroParallax(rawProgress) {
  if (!hero) {
    return;
  }

  const parallaxOffset = rawProgress * HERO_PARALLAX_PX;
  if (window.innerWidth <= MOBILE_BREAKPOINT_PX) {
    hero.style.transform = `translate3d(0, ${parallaxOffset.toFixed(2)}px, 0)`;
    return;
  }

  hero.style.transform = `translateY(calc(-50% + ${parallaxOffset.toFixed(2)}px))`;
}

function fitVideoToViewport() {
  if (!threeReady) {
    return;
  }

  const viewportAspect = window.innerWidth / window.innerHeight;
  const videoAspect =
    fallbackVideo.videoWidth && fallbackVideo.videoHeight
      ? fallbackVideo.videoWidth / fallbackVideo.videoHeight
      : 16 / 9;

  const visibleHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
  const visibleWidth = visibleHeight * viewportAspect;

  if (videoAspect > viewportAspect) {
    plane.scale.set(visibleHeight * videoAspect, visibleHeight, 1);
  } else {
    plane.scale.set(visibleWidth, visibleWidth / videoAspect, 1);
  }
}

function updateTargetTimeFromScroll() {
  const animationScrollRange = Math.max((scrollSpace ? scrollSpace.offsetHeight : window.innerHeight) - window.innerHeight, 1);
  const clampedScroll = Math.min(Math.max(window.scrollY, 0), animationScrollRange);
  const rawProgress = clampedScroll / animationScrollRange;
  // Boost early response: tiny scroll moves first frames sooner.
  const progress = Math.pow(rawProgress, SCROLL_EARLY_BOOST_POWER);
  const playableDuration = duration * SCROLL_SPEED_FACTOR;
  targetTime = progress * playableDuration;

  updateHeroParallax(rawProgress);

  updateSectionTransition();
}

function updateSectionTransition() {
  if (!workflowSection || !useCasesSection || !useCasesInner) {
    return;
  }

  const viewportHeight = window.innerHeight;
  const transitionStart = useCasesSection.offsetTop - viewportHeight;
  const transitionRange = Math.max(viewportHeight * 0.9, 1);
  const transitionProgress = clamp01((window.scrollY - transitionStart) / transitionRange);
  const easedProgress = smoothstep(0, 1, transitionProgress);

  workflowSection.style.opacity = "1";
  workflowSection.style.transform = "none";

  if (workflowGrid) {
    const innerEase = smoothstep(0.05, 1, transitionProgress);
    workflowGrid.style.opacity = `${1 - innerEase}`;
    workflowGrid.style.transform = `translate3d(0, ${(18 * innerEase).toFixed(2)}px, 0)`;
  }

  useCasesInner.style.opacity = `${easedProgress}`;
  useCasesInner.style.transform = `translate3d(0, ${(42 - 42 * easedProgress).toFixed(2)}px, 0)`;
}

fallbackVideo.addEventListener("loadedmetadata", () => {
  duration = Math.max(fallbackVideo.duration || 1, 1);
  updateTargetTimeFromScroll();
  fitVideoToViewport();
});
fallbackVideo.addEventListener("seeked", () => {
  if (videoTexture) {
    videoTexture.needsUpdate = true;
  }
});

async function unlockVideoDecoding() {
  if (canScrub) {
    return;
  }
  try {
    await fallbackVideo.play();
    fallbackVideo.pause();
    canScrub = true;
    if (videoTexture) {
      videoTexture.needsUpdate = true;
    }
  } catch (_error) {
    // Ignore blocked autoplay; we'll retry on next user interaction.
  }
}

window.addEventListener("scroll", updateTargetTimeFromScroll, { passive: true });
window.addEventListener("wheel", unlockVideoDecoding, { passive: true });
window.addEventListener("touchstart", unlockVideoDecoding, { passive: true });
window.addEventListener("pointerdown", unlockVideoDecoding, { passive: true });

window.addEventListener("resize", () => {
  if (threeReady) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  fitVideoToViewport();
  updateTargetTimeFromScroll();
  updateSectionTransition();
});

function animate() {
  requestAnimationFrame(animate);

  const nowMs = performance.now();
  const deltaSeconds = Math.min((nowMs - lastFrameTimeMs) / 1000, 0.1);
  lastFrameTimeMs = nowMs;

  const lerpAlpha = 1 - Math.exp(-SMOOTHING_RESPONSE * deltaSeconds);
  const smoothedTarget = displayedTime + (targetTime - displayedTime) * lerpAlpha;
  const maxStep = MAX_SEEK_SPEED * deltaSeconds;
  const step = Math.max(Math.min(smoothedTarget - displayedTime, maxStep), -maxStep);
  displayedTime += step;

  const quantizedTime = Math.round(displayedTime / FRAME_STEP) * FRAME_STEP;
  const shouldSeekNow =
    nowMs - lastSeekAtMs >= SEEK_INTERVAL_MS ||
    Math.abs(fallbackVideo.currentTime - quantizedTime) > FRAME_STEP * 1.5;

  if (shouldSeekNow) {
    if (Math.abs(fallbackVideo.currentTime - quantizedTime) > SEEK_EPSILON) {
      fallbackVideo.currentTime = Math.max(0, Math.min(quantizedTime, duration));
    }
    lastSeekAtMs = nowMs;
  }

  if (threeReady) {
    renderer.render(scene, camera);
  }
}

fallbackVideo.load();
unlockVideoDecoding();
updateSectionTransition();
animate();

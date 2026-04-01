const VIDEO_URL =
  "https://r2.syntx.ai/user_8941760239158877405/generated/809f2ca238fa82a2902f1b22aa210a05_84bc23ff-550d-4838-9cb3-54177b8d8774.mp4";

const canvas = document.querySelector("#webgl-canvas");
const fallbackVideo = document.querySelector("#fallback-video");

let scene = null;
let camera = null;
let renderer = null;
let plane = null;
let videoTexture = null;
let threeReady = false;

fallbackVideo.crossOrigin = "anonymous";
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
const SEEK_EPSILON = 1 / 120;
let lastFrameTimeMs = performance.now();

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
  const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
  const scrollY = Math.min(Math.max(window.scrollY, 0), maxScroll);
  const progress = scrollY / maxScroll;
  const playableDuration = duration * SCROLL_SPEED_FACTOR;
  targetTime = progress * playableDuration;
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

  if (Math.abs(fallbackVideo.currentTime - displayedTime) > SEEK_EPSILON) {
    fallbackVideo.currentTime = displayedTime;
  }

  if (threeReady) {
    renderer.render(scene, camera);
  }
}

fallbackVideo.load();
unlockVideoDecoding();
animate();

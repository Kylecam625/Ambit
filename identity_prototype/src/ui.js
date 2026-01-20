import { start_camera, stop_camera } from "./camera.js";
import { create_profile_store } from "./profile_store.js";
import { get_default_model_base_url, get_models_state, load_models } from "./models.js";
import { build_face_matcher, detect_single_face, draw_overlay, match_face } from "./recognition.js";
import { sleep, to_int_or_null, to_string_or_empty } from "./utils.js";

const MODEL_BASE_URL = get_default_model_base_url();
const STORE_BASE_URL = "http://localhost:5176";
const STREAK_REQUIRED = 3;
const DETECTION_INTERVAL_MS = 30;
const RENDER_FPS = 30;
const RENDER_INTERVAL_MS = 1000 / RENDER_FPS;
const LOST_AFTER_MS = 400;
const SMOOTHING = 0.35;

let DISTANCE_THRESHOLD = 0.45; // Now mutable via slider

const el = (id) => {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing element: ${id}`);
  return value;
};

const set_status = ({ node, text, kind }) => {
  node.textContent = text;
  node.classList.remove("ok", "warn", "bad");
  if (kind) node.classList.add(kind);
};

const main = async () => {
  const video_el = /** @type {HTMLVideoElement} */ (el("video"));
  const overlay_el = /** @type {HTMLCanvasElement} */ (el("overlay"));

  const build_pill = el("build_pill");
  const connection_pill = el("connection_pill");
  const base_url_label = el("base_url_label");
  const camera_state_pill = el("camera_state_pill");

  const start_camera_btn = /** @type {HTMLButtonElement} */ (el("start_camera_btn"));
  const stop_camera_btn = /** @type {HTMLButtonElement} */ (el("stop_camera_btn"));

  const models_state = el("models_state");
  const detected_state = el("detected_state");
  const recognized_state = el("recognized_state");
  const threshold_value = el("threshold_value");
  const threshold_slider = /** @type {HTMLInputElement} */ (el("threshold_slider"));
  
  const profile_count = el("profile_count");
  const profiles_list = el("profiles_list");

  const profile_modal = el("profile_modal");
  const modal_backdrop = el("modal_backdrop");
  const modal_name = /** @type {HTMLInputElement} */ (el("modal_name"));
  const modal_age = /** @type {HTMLInputElement} */ (el("modal_age"));
  const modal_interests = /** @type {HTMLTextAreaElement} */ (el("modal_interests"));
  const modal_capture_btn = /** @type {HTMLButtonElement} */ (el("modal_capture_btn"));
  const modal_cancel_btn = /** @type {HTMLButtonElement} */ (el("modal_cancel_btn"));
  const modal_create_btn = /** @type {HTMLButtonElement} */ (el("modal_create_btn"));
  const capture_count = el("capture_count");
  const enrollment_preview = /** @type {HTMLCanvasElement} */ (el("enrollment_preview"));
  const enrollment_instruction = el("enrollment_instruction");
  const enrollment_thumbnails = el("enrollment_thumbnails");

  build_pill.textContent = "standalone";
  base_url_label.textContent = STORE_BASE_URL;

  const store = create_profile_store({ mode: "remote", base_url: STORE_BASE_URL });

  let stream = null;
  let is_loop_running = false;
  let face_matcher = null;
  let profiles_cache = [];

  let did_prompt = false;
  let target_box = null;
  let smoothed_box = null;
  let last_detection_dims = null;
  let last_detection_at = 0;
  let draw_label = "";

  let last_label = null;
  let label_streak = 0;
  let is_render_running = false;
  
  let captured_descriptors = [];
  let captured_thumbnails = [];
  let auto_enroll_mode = false;
  let unrecognized_streak = 0;
  let enrollment_preview_running = false;
  const UNRECOGNIZED_PROMPT_STREAK = 20; // ~6 seconds at 30fps
  
  const CAPTURE_INSTRUCTIONS = [
    "Look straight at the camera 📸",
    "Turn your head slightly LEFT ⬅️",
    "Turn your head slightly RIGHT ➡️",
  ];

  const update_buttons = () => {
    start_camera_btn.disabled = Boolean(stream);
    stop_camera_btn.disabled = !stream;
  };

  const set_camera_state = (state) => {
    camera_state_pill.textContent = state;
  };

  const set_connection_state = (ok) => {
    set_status({
      node: connection_pill,
      text: ok ? "connected" : "offline",
      kind: ok ? "ok" : "bad",
    });
  };

  const draw_enrollment_preview = () => {
    if (!stream || !enrollment_preview_running) return;
    
    const vw = video_el.videoWidth || 0;
    const vh = video_el.videoHeight || 0;
    if (!vw || !vh) {
      requestAnimationFrame(draw_enrollment_preview);
      return;
    }

    const pw = enrollment_preview.clientWidth || 400;
    const ph = enrollment_preview.clientHeight || 300;
    enrollment_preview.width = pw;
    enrollment_preview.height = ph;

    const ctx = enrollment_preview.getContext("2d");
    if (!ctx) {
      requestAnimationFrame(draw_enrollment_preview);
      return;
    }

    // Draw mirrored video to match main display
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video_el, -pw, 0, pw, ph);
    ctx.restore();

    if (enrollment_preview_running) {
      requestAnimationFrame(draw_enrollment_preview);
    }
  };

  const start_enrollment_preview = () => {
    if (!stream) return;
    enrollment_preview_running = true;
    draw_enrollment_preview();
  };

  const stop_enrollment_preview = () => {
    enrollment_preview_running = false;
    const ctx = enrollment_preview.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, enrollment_preview.width, enrollment_preview.height);
    }
  };

  const update_enrollment_instruction = () => {
    const count = captured_descriptors.length;
    if (count < 3) {
      enrollment_instruction.textContent = CAPTURE_INSTRUCTIONS[count];
      enrollment_instruction.hidden = false;
    } else {
      enrollment_instruction.textContent = "✓ All captures complete!";
    }
  };

  const open_modal = () => {
    captured_descriptors = [];
    captured_thumbnails = [];
    capture_count.textContent = "0";
    modal_create_btn.disabled = true;
    
    // Clear thumbnail slots
    enrollment_thumbnails.querySelectorAll(".thumbnail_slot").forEach((slot, i) => {
      slot.innerHTML = String(i + 1);
      slot.classList.remove("captured");
    });
    
    profile_modal.hidden = false;
    document.body.classList.add("modal-open");
    update_enrollment_instruction();
    start_enrollment_preview();
    modal_name.focus();
  };

  const close_modal = () => {
    stop_enrollment_preview();
    profile_modal.hidden = true;
    document.body.classList.remove("modal-open");
    captured_descriptors = [];
    captured_thumbnails = [];
    auto_enroll_mode = false;
    modal_name.value = "";
    modal_age.value = "";
    modal_interests.value = "";
    capture_count.textContent = "0";
    modal_create_btn.disabled = true;
  };

  const maybe_prompt_create_profile = () => {
    if (did_prompt) return;
    if (!stream) return;
    if (profiles_cache.length > 0) return;
    did_prompt = true;
    auto_enroll_mode = true;
    open_modal();
  };

  const capture_thumbnail = () => {
    const vw = video_el.videoWidth || 0;
    const vh = video_el.videoHeight || 0;
    if (!vw || !vh) return null;

    const thumbCanvas = document.createElement("canvas");
    const size = 120;
    thumbCanvas.width = size;
    thumbCanvas.height = size;
    const ctx = thumbCanvas.getContext("2d");
    if (!ctx) return null;

    // Draw mirrored thumbnail
    ctx.save();
    ctx.scale(-1, 1);
    const aspectRatio = vw / vh;
    if (aspectRatio > 1) {
      const drawHeight = size / aspectRatio;
      const offsetY = (size - drawHeight) / 2;
      ctx.drawImage(video_el, -size, offsetY, size, drawHeight);
    } else {
      const drawWidth = size * aspectRatio;
      const offsetX = (size - drawWidth) / 2;
      ctx.drawImage(video_el, -(offsetX + drawWidth), 0, drawWidth, size);
    }
    ctx.restore();

    return thumbCanvas;
  };

  const update_capture_count = () => {
    capture_count.textContent = String(captured_descriptors.length);
    modal_create_btn.disabled = captured_descriptors.length === 0;
    modal_capture_btn.textContent = captured_descriptors.length >= 3 
      ? "✓ 3 Captures Complete" 
      : `📷 Capture Face`;
    modal_capture_btn.disabled = captured_descriptors.length >= 3;
    
    update_enrollment_instruction();
    
    // Update thumbnail displays
    captured_thumbnails.forEach((canvas, i) => {
      const slot = enrollment_thumbnails.querySelector(`[data-slot="${i}"]`);
      if (slot) {
        slot.innerHTML = "";
        slot.appendChild(canvas.cloneNode(true));
        slot.classList.add("captured");
      }
    });
  };

  const load_models_and_refresh_ui = async () => {
    set_status({ node: models_state, text: "loading", kind: "warn" });
    try {
      await load_models({ base_url: MODEL_BASE_URL });
      const state = get_models_state();
      set_status({
        node: models_state,
        text: state.is_loaded ? "loaded" : "not loaded",
        kind: state.is_loaded ? "ok" : "bad",
      });
      return state.is_loaded;
    } catch (error) {
      set_status({ node: models_state, text: "error", kind: "bad" });
      console.error(error);
      return false;
    }
  };

  const render_profiles_list = () => {
    profile_count.textContent = String(profiles_cache.length);
    
    if (profiles_cache.length === 0) {
      profiles_list.innerHTML = '<p class="muted">No profiles loaded</p>';
      return;
    }

    profiles_list.innerHTML = profiles_cache
      .map((profile) => {
        const age_text = profile.age ? `, ${profile.age}` : "";
        const interests_text = profile.interests ? profile.interests : "No interests";
        const enrollments_text = `${profile.enrollments.length} enrollment${profile.enrollments.length !== 1 ? 's' : ''}`;
        
        return `
          <div class="profile_card">
            <div class="profile_info">
              <div class="profile_name">${profile.name}${age_text}</div>
              <div class="profile_details">${interests_text} • ${enrollments_text}</div>
            </div>
            <button class="delete_btn" data-profile-id="${profile.profile_id}">Delete</button>
          </div>
        `;
      })
      .join("");
    
    // Add event listeners to delete buttons
    profiles_list.querySelectorAll(".delete_btn").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const profile_id = e.target.getAttribute("data-profile-id");
        const profile = profiles_cache.find((p) => p.profile_id === profile_id);
        if (!profile) return;
        
        if (confirm(`Delete profile "${profile.name}"?`)) {
          try {
            await store.delete_profile({ profile_id });
            await refresh_profiles();
          } catch (error) {
            console.error(error);
            alert("Failed to delete profile.");
          }
        }
      });
    });
  };

  const rebuild_face_matcher = async () => {
    if (profiles_cache.length === 0) {
      face_matcher = null;
      return;
    }
    
    try {
      const matcher = await build_face_matcher({
        profiles: profiles_cache,
        distance_threshold: DISTANCE_THRESHOLD,
      });
      face_matcher = matcher?.face_matcher ?? null;
    } catch (error) {
      console.error(error);
      face_matcher = null;
    }
  };

  const refresh_profiles = async () => {
    try {
      profiles_cache = await store.list_profiles();
      await rebuild_face_matcher();
      set_connection_state(true);
      render_profiles_list();
    } catch (error) {
      console.error(error);
      profiles_cache = [];
      face_matcher = null;
      set_connection_state(false);
      render_profiles_list();
    }

    maybe_prompt_create_profile();
  };

  const capture_face = async () => {
    if (!stream) {
      alert("Camera must be running.");
      return;
    }

    if (captured_descriptors.length >= 3) {
      return;
    }

    modal_capture_btn.disabled = true;
    modal_capture_btn.textContent = "📸 Capturing...";

    try {
      const detection = await detect_single_face({ video_el, input_size: 320, score_threshold: 0.6 });
      if (!detection || !detection.descriptor) {
        alert("No face detected. Make sure your face is clearly visible and try again.");
        modal_capture_btn.disabled = false;
        update_capture_count();
        return;
      }

      // Capture thumbnail
      const thumbnail = capture_thumbnail();
      if (thumbnail) {
        captured_thumbnails.push(thumbnail);
      }

      captured_descriptors.push(Array.from(detection.descriptor));
      update_capture_count();
    } catch (error) {
      console.error(error);
      alert("Failed to capture face. Please try again.");
    }

    modal_capture_btn.disabled = false;
    update_capture_count();
  };

  const create_profile_from_modal = async () => {
    if (!stream) {
      alert("Start the camera first.");
      return;
    }

    const name = to_string_or_empty(modal_name.value).trim();
    if (!name) {
      alert("Name is required.");
      return;
    }

    if (captured_descriptors.length === 0) {
      alert("Please capture at least one face image.");
      return;
    }

    const age = to_int_or_null(modal_age.value);
    const interests = to_string_or_empty(modal_interests.value).trim();

    try {
      modal_create_btn.disabled = true;
      modal_create_btn.textContent = "Creating...";

      const created = await store.create_profile({ name, age, interests });
      if (!created?.profile_id) {
        throw new Error("Profile creation failed.");
      }

      // Add all captured enrollments
      for (const descriptor of captured_descriptors) {
        await store.add_enrollment({
          profile_id: created.profile_id,
          descriptor,
          image_data_url: null,
        });
      }

      close_modal();
      await refresh_profiles();
      alert(`Profile "${name}" created with ${captured_descriptors.length} enrollment(s)!`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to create profile.");
      modal_create_btn.disabled = false;
      modal_create_btn.textContent = "Create Profile";
    }
  };

  const reset_overlay = () => {
    const w = overlay_el.width || 0;
    const h = overlay_el.height || 0;
    const ctx = overlay_el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
  };

  const clear_tracking = () => {
    target_box = null;
    smoothed_box = null;
    last_detection_dims = null;
    last_detection_at = 0;
    draw_label = "";
    reset_overlay();
  };

  const start_render_loop = () => {
    if (is_render_running) return;
    is_render_running = true;
    let last_render = 0;

    const tick = (ts) => {
      if (!is_render_running) return;
      if (ts - last_render >= RENDER_INTERVAL_MS) {
        last_render = ts;
        const now = performance.now();
        const video_ok = (video_el.videoWidth || 0) > 0 && (video_el.videoHeight || 0) > 0;

        if (!video_ok) {
          reset_overlay();
        } else if (!target_box || (last_detection_at && now - last_detection_at > LOST_AFTER_MS)) {
          if (target_box || smoothed_box) {
            target_box = null;
            smoothed_box = null;
            last_detection_dims = null;
            last_detection_at = 0;
            reset_overlay();
          }
        } else {
          if (!smoothed_box) {
            smoothed_box = { ...target_box };
          } else {
            smoothed_box = {
              x: smoothed_box.x + (target_box.x - smoothed_box.x) * SMOOTHING,
              y: smoothed_box.y + (target_box.y - smoothed_box.y) * SMOOTHING,
              width: smoothed_box.width + (target_box.width - smoothed_box.width) * SMOOTHING,
              height: smoothed_box.height + (target_box.height - smoothed_box.height) * SMOOTHING,
            };
          }

          const draw_detection = {
            detection: {
              box: smoothed_box,
              imageWidth: last_detection_dims?.imageWidth,
              imageHeight: last_detection_dims?.imageHeight,
            },
          };

          void draw_overlay({
            canvas_el: overlay_el,
            video_el,
            detection: draw_detection,
            label: draw_label,
            mirror: true,
          });
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  };

  const stop_render_loop = () => {
    is_render_running = false;
  };

  const loop = async () => {
    is_loop_running = true;

    while (is_loop_running) {
      const state = get_models_state();
      if (!state.is_loaded || !stream) {
        await sleep(100);
        continue;
      }

      const vw = video_el.videoWidth || 0;
      const vh = video_el.videoHeight || 0;
      if (!vw || !vh) {
        await sleep(100);
        continue;
      }

      try {
        const detection = await detect_single_face({ 
          video_el,
          input_size: 320,  // SSD MobileNet doesn't use inputSize, but keeping for API consistency
          score_threshold: 0.6  // Higher threshold for better accuracy
        });

        if (!detection) {
          set_status({ node: detected_state, text: "no", kind: "warn" });
          set_status({ node: recognized_state, text: "Unknown", kind: undefined });
          last_label = null;
          label_streak = 0;
          draw_label = "";
          await sleep(DETECTION_INTERVAL_MS);
          continue;
        }

        set_status({ node: detected_state, text: "yes", kind: "ok" });

        const match = await match_face({ face_matcher, descriptor: detection.descriptor });
        const label = match.label || "unknown";

        if (label && label !== "unknown") {
          if (label === last_label) {
            label_streak += 1;
          } else {
            last_label = label;
            label_streak = 1;
          }
          unrecognized_streak = 0;
        } else {
          last_label = null;
          label_streak = 0;
          unrecognized_streak += 1;
          
          // Prompt to create profile after sustained unrecognized detection
          if (unrecognized_streak === UNRECOGNIZED_PROMPT_STREAK && !auto_enroll_mode && profile_modal.hidden) {
            auto_enroll_mode = true;
            open_modal();
          }
        }

        const is_confirmed = Boolean(label && label !== "unknown" && label_streak >= STREAK_REQUIRED);
        const matched_profile = is_confirmed
          ? profiles_cache.find((p) => p.profile_id === label) || null
          : null;
        const display_name = matched_profile?.name ?? "Unknown";
        draw_label = is_confirmed ? display_name : "";
        
        // Reset auto-enroll mode if face is recognized
        if (is_confirmed && auto_enroll_mode) {
          auto_enroll_mode = false;
        }

        set_status({
          node: recognized_state,
          text: is_confirmed ? display_name : "Unknown",
          kind: is_confirmed ? "ok" : undefined,
        });

        const raw_box = detection?.detection?.box;
        if (raw_box) {
          target_box = {
            x: raw_box.x,
            y: raw_box.y,
            width: raw_box.width,
            height: raw_box.height,
          };
          last_detection_dims = {
            imageWidth: detection?.detection?.imageWidth,
            imageHeight: detection?.detection?.imageHeight,
          };
          last_detection_at = performance.now();
        } else {
          clear_tracking();
        }
      } catch (error) {
        console.error(error);
      }

      await sleep(DETECTION_INTERVAL_MS);
    }
  };

  const stop_loop = () => {
    is_loop_running = false;
  };

  start_camera_btn.addEventListener("click", async () => {
    const models_ready = await load_models_and_refresh_ui();
    if (!models_ready) {
      alert("Models failed to load.");
      return;
    }

    try {
      stream = await start_camera({ video_el, facing_mode: "user" });
      set_camera_state("running");
      update_buttons();
      await refresh_profiles();

      if (!is_loop_running) void loop();
      start_render_loop();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to start camera");
    }
  });

  stop_camera_btn.addEventListener("click", () => {
    stop_loop();
    stop_render_loop();
    stop_camera({ video_el });
    stream = null;
    set_camera_state("stopped");
    clear_tracking();
    update_buttons();
  });

  threshold_slider.addEventListener("input", () => {
    DISTANCE_THRESHOLD = parseFloat(threshold_slider.value) || 0.45;
    threshold_value.textContent = DISTANCE_THRESHOLD.toFixed(2);
    void rebuild_face_matcher();
  });

  modal_backdrop.addEventListener("click", () => close_modal());
  modal_cancel_btn.addEventListener("click", () => close_modal());
  modal_capture_btn.addEventListener("click", () => void capture_face());
  modal_create_btn.addEventListener("click", () => void create_profile_from_modal());
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !profile_modal.hidden) {
      close_modal();
    }
  });

  update_buttons();
  set_camera_state("stopped");
  set_status({ node: detected_state, text: "no", kind: "warn" });
  set_status({ node: recognized_state, text: "Unknown", kind: undefined });

  await load_models_and_refresh_ui();
  await refresh_profiles();
};

void main();

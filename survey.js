// One-question-at-a-time contact flow posted to the fixed-recipient lead endpoint.
const survey = document.getElementById("survey");

if (survey) {
  const form = document.getElementById("survey-form");
  const steps = [...form.querySelectorAll(".survey-step")];
  const questions = steps.filter((step) => step.dataset.kind !== "done");
  const doneStep = steps.find((step) => step.dataset.kind === "done");
  const progress = form.querySelector(".survey__progress span");
  const counter = form.querySelector("[data-survey-count]");
  const prevButton = form.querySelector("[data-survey-prev]");
  const navNext = form.querySelector(".survey__nav [data-survey-next]");
  const submitButton = form.querySelector('button[type="submit"]');
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  // Deliberately loose: the browser's type=email check rejects real addresses typed through IMEs.
  const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  let current = 0;
  let submitting = false;
  let advanceTimer;
  let challengeId;
  let challengeToken = "";
  const challengeContainer = document.getElementById("lead-security-check");
  const renderChallenge = () => {
    if (challengeId !== undefined || !window.turnstile || !survey.open || current !== questions.length - 1) return;
    challengeId = window.turnstile.render(challengeContainer, {
      sitekey: challengeContainer.dataset.sitekey,
      action: "website_lead",
      callback: (token) => { challengeToken = token; setError(questions[questions.length - 1], ""); },
      "expired-callback": () => { challengeToken = ""; },
      "error-callback": () => { challengeToken = ""; setError(questions[questions.length - 1], "Security check unavailable. Please retry or email info@nuvalab.ai."); }
    });
  };
  window.nuvaTurnstileReady = renderChallenge;

  const track = (name, params = {}) => {
    if (typeof gtag === "function") gtag("event", name, { form_name: "fasth3_access_survey", ...params });
  };

  const setError = (step, message) => {
    const error = step.querySelector(".survey-step__error");
    if (error) error.textContent = message;
    if (message) {
      step.classList.remove("is-shaking");
      void step.offsetWidth; // restart the animation on repeated misses
      step.classList.add("is-shaking");
    }
  };

  const validate = (step) => {
    const kind = step.dataset.kind;
    if (kind === "single" || kind === "multi") {
      const picked = step.querySelector("input:checked");
      setError(step, picked ? "" : kind === "single" ? "Pick one to continue." : "Pick at least one to continue.");
      return Boolean(picked);
    }
    const invalid = [...step.querySelectorAll("input, textarea")].find((input) => {
      // NFKC folds full-width characters from CJK IMEs (＠ → @, ． → .) and drops stray spaces.
      input.value = input.tagName === "TEXTAREA"
        ? input.value.normalize("NFKC").replace(/\r\n?/g, "\n").trim()
        : input.value.normalize("NFKC").replace(/\s+/g, input.type === "email" ? "" : " ").trim();
      if (input.type === "email") return !EMAIL.test(input.value);
      return input.required && !input.value;
    });
    if (invalid) {
      setError(step, invalid.type === "email" && invalid.value ? "That email doesn't look right." : "Please fill this in.");
      invalid.focus();
      return false;
    }
    setError(step, "");
    return true;
  };

  const focusStep = (step) => {
    const target =
      step.querySelector(".survey-input") ||
      step.querySelector("input:checked") ||
      step.querySelector("input:not(.survey__trap)") ||
      step.querySelector("h2");
    // Let the entrance animation start before focusing so mobile keyboards don't jump the layout.
    requestAnimationFrame(() => target && target.focus({ preventScroll: true }));
  };

  const show = (index, direction = 1) => {
    clearTimeout(advanceTimer);
    const step = steps[index];
    steps.forEach((item) => item.classList.remove("is-active", "is-back", "is-shaking"));
    step.classList.toggle("is-back", direction < 0);
    step.classList.add("is-active");
    current = index;

    const isDone = step === doneStep;
    const answered = isDone ? questions.length : index;
    progress.style.width = `${(answered / questions.length) * 100}%`;
    counter.textContent = isDone ? "Complete" : `${index + 1} of ${questions.length}`;
    prevButton.disabled = index === 0 || isDone;
    navNext.disabled = isDone;
    focusStep(step);
    if (step === questions[questions.length - 1]) renderChallenge();
    if (!isDone && survey.open) track("survey_step", { step: index + 1 });
  };

  const personalize = () => {
    const first = form.elements.name.value.trim().split(/\s+/)[0];
    form.querySelectorAll("[data-first-name]").forEach((el) => {
      el.textContent = first ? `, ${first}` : "";
    });
    form.querySelector("[data-echo-email]").textContent = form.elements.email.value.trim();
  };

  const submit = async () => {
    if (submitting) return;
    if (!challengeToken) {
      renderChallenge();
      setError(questions[questions.length - 1], "Please complete the security check below.");
      return;
    }
    submitting = true;
    const step = questions[questions.length - 1];
    submitButton.disabled = true;
    submitButton.firstChild.textContent = "Sending… ";

    const fields = new FormData(form);
    const needs = fields.getAll("needs");
    const data = Object.fromEntries(["name", "email", "company", "role", "business_type", "business_goal", "video_volume", "page", "utm", "_gotcha"].map(key => [key, fields.get(key) || ""]));
    data.needs = needs;
    data.token = challengeToken;

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { Accept: "application/json", "Content-Type": "application/json" }
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) throw new Error("Lead submission failed");
      personalize();
      track("generate_lead", { video_volume: data.video_volume, needs: needs.join("|") });
      show(steps.indexOf(doneStep));
    } catch (error) {
      setError(step, "Something went wrong. Try again, or email info@nuvalab.ai.");
    } finally {
      challengeToken = "";
      if (challengeId !== undefined) window.turnstile.reset(challengeId);
      submitting = false;
      submitButton.disabled = false;
      submitButton.firstChild.textContent = "Send request ";
    }
  };

  const next = () => {
    const step = steps[current];
    if (step === doneStep || !validate(step)) return;
    if (current === questions.length - 1) {
      submit();
      return;
    }
    if (step.querySelector('input[name="name"]')) personalize();
    show(current + 1, 1);
  };

  const prev = () => {
    if (current > 0 && steps[current] !== doneStep) show(current - 1, -1);
  };

  const open = (source) => {
    form.elements.page.value = window.location.origin + window.location.pathname;
    form.elements.utm.value = new URLSearchParams(window.location.search)
      .toString()
      .split("&")
      .filter((pair) => pair.startsWith("utm_"))
      .join("&");
    track("survey_open", { source });
    if (!survey.open) survey.showModal();
    if (steps[current] === doneStep) {
      form.reset();
      show(0);
    } else {
      show(current);
    }
  };

  const close = () => {
    survey.close();
  };

  // Pick an option: single-choice advances on its own, multi-choice waits for OK/Enter.
  const pick = (input) => {
    const step = input.closest(".survey-step");
    if (input.type === "checkbox") {
      if (input.checked && input.hasAttribute("data-exclusive")) {
        step.querySelectorAll('input[type="checkbox"]').forEach((box) => { if (box !== input) box.checked = false; });
      } else if (input.checked) {
        const exclusive = step.querySelector("input[data-exclusive]");
        if (exclusive) exclusive.checked = false;
      }
      setError(step, "");
      return;
    }
    setError(step, "");
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(next, 280);
  };

  let pointerPick = false;
  form.addEventListener("pointerdown", (event) => {
    pointerPick = Boolean(event.target.closest(".survey-option"));
  });
  form.addEventListener("change", (event) => {
    const input = event.target;
    if (!input.closest(".survey-option")) return;
    // Arrow keys also change radios; only auto-advance for deliberate picks.
    if (input.type === "radio" && !pointerPick) {
      setError(input.closest(".survey-step"), "");
      return;
    }
    pointerPick = false;
    pick(input);
  });

  form.addEventListener("input", (event) => {
    if (event.target.matches(".survey-input")) setError(event.target.closest(".survey-step"), "");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    next();
  });

  survey.addEventListener("click", (event) => {
    if (event.target.closest("[data-survey-next]")) {
      event.preventDefault();
      next();
    } else if (event.target.closest("[data-survey-prev]")) {
      prev();
    } else if (event.target.closest("[data-survey-close]")) {
      close();
    }
  });

  survey.addEventListener("keydown", (event) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    const step = steps[current];
    const inTextField = event.target.matches(".survey-input");

    if (event.key === "Enter" && event.target.tagName === "TEXTAREA") return;

    if (event.key === "Enter" && !event.shiftKey) {
      if (event.target.closest("[data-survey-close], [data-survey-prev], a")) return;
      event.preventDefault();
      if (step === doneStep) close();
      else next();
      return;
    }

    if (inTextField) return;
    const index = letters.indexOf(event.key.toUpperCase());
    if (index < 0 || event.key.length !== 1) return;
    const input = step.querySelectorAll(".survey-option input")[index];
    if (!input) return;
    event.preventDefault();
    input.checked = input.type === "radio" ? true : !input.checked;
    input.focus({ preventScroll: true });
    pick(input);
  });

  document.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-survey-open]");
    if (!opener) return;
    event.preventDefault();
    open(opener.textContent.trim().slice(0, 60));
  });

  // nuvalab.ai/#survey opens it directly, so outreach links and other pages can deep-link.
  const openFromHash = () => {
    if (window.location.hash === "#survey") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      open("deep_link");
    }
  };
  window.addEventListener("hashchange", openFromHash);
  openFromHash();

  show(0);
}

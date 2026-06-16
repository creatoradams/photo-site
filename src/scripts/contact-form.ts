import { api } from "./api";

function initContactForm() {
  const form = document.querySelector<HTMLFormElement>("[data-contact-form]");
  if (!form || form.dataset.bound) return;
  form.dataset.bound = "1";

  const errEl = form.querySelector<HTMLElement>("[data-contact-error]");
  const okEl = form.querySelector<HTMLElement>("[data-contact-success]");
  const submitBtn = form.querySelector<HTMLButtonElement>("[data-contact-submit]");

  const field = (name: string) =>
    (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errEl?.classList.add("hidden");
    okEl?.classList.add("hidden");

    const payload = {
      name: field("name").trim(),
      email: field("email").trim(),
      message: field("message").trim(),
      company: field("company").trim(),
    };

    if (!payload.email || !payload.message) {
      if (errEl) {
        errEl.textContent = "Please add your email and a message.";
        errEl.classList.remove("hidden");
      }
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
    try {
      await api("/api/contact", { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      if (okEl) {
        okEl.textContent = "Thanks — your message has been sent. I'll be in touch soon.";
        okEl.classList.remove("hidden");
      }
    } catch (ex) {
      if (errEl) {
        errEl.textContent =
          ex instanceof Error ? ex.message : "Could not send your message. Please email directly.";
        errEl.classList.remove("hidden");
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

initContactForm();
document.addEventListener("astro:page-load", initContactForm);

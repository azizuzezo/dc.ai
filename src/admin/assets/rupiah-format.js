/** Auto-formats any <input class="rupiah-input"> with thousand-separator dots
 * as the host/donor types (e.g. "50000" -> "50.000"), and strips the dots
 * back out right before its form submits, so the server still receives a
 * plain digit string. Shared across every dashboard + the donor checkout page
 * instead of duplicating this per form. */
(function () {
  function formatDots(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function attach(input) {
    if (input.value) input.value = formatDots(input.value.replace(/\D/g, ""));
    input.addEventListener("input", () => {
      const distanceFromEnd = input.value.length - input.selectionStart;
      const digits = input.value.replace(/\D/g, "");
      input.value = formatDots(digits);
      const pos = Math.max(0, input.value.length - distanceFromEnd);
      input.setSelectionRange(pos, pos);
    });
  }

  document.querySelectorAll("input.rupiah-input").forEach(attach);

  // Capture phase so this strips dots before any other submit handler (or
  // the browser's own submission) reads the field's value.
  document.addEventListener(
    "submit",
    (e) => {
      e.target.querySelectorAll?.("input.rupiah-input").forEach((input) => {
        input.value = input.value.replace(/\./g, "");
      });
    },
    true
  );
})();

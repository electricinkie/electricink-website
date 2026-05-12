    (function () {
      const form = document.getElementById('conv-form');
      const submitBtn = document.getElementById('conv-submit');
      const successEl = document.getElementById('conv-success');

      form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const organizer_name = document.getElementById('organizer_name').value.trim();
        const email = document.getElementById('email').value.trim();
        const convention_name = document.getElementById('convention_name').value.trim();
        const event_date_start = document.getElementById('event_date_start').value;
        const event_date_end   = document.getElementById('event_date_end').value;
        if (event_date_start && event_date_end && event_date_end < event_date_start) {
          alert('End date cannot be before start date.');
          return;
        }
        const event_date = event_date_start
          ? (event_date_end && event_date_end !== event_date_start
              ? `${event_date_start} to ${event_date_end}`
              : event_date_start)
          : '';
        document.getElementById('event_date').value = event_date;
        const location = document.getElementById('location').value.trim();

        if (!organizer_name || !email || !convention_name) {
          alert('Please fill in your name, email and convention name.');
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          alert('Please enter a valid email address.');
          return;
        }
        if (organizer_name.length > 100 || convention_name.length > 150 || email.length > 150) {
          alert('One or more fields exceed the maximum allowed length.');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending…';

        try {
          const res = await fetch('/api/convention-apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organizer_name, email, convention_name, event_date, location }),
          });

          if (!res.ok) throw new Error('Failed');

          form.style.display = 'none';
          successEl.style.display = 'block';
          successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        } catch (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Application';
          alert('Something went wrong. Please try again or email us at hello@electricink.ie');
        }
      });

      // Sync end date min with start date so "To" can never be before "From"
      document.getElementById('event_date_start').addEventListener('change', function () {
        const endInput = document.getElementById('event_date_end');
        endInput.min = this.value;
        if (endInput.value && endInput.value < this.value) {
          endInput.value = this.value;
        }
      });
    })();

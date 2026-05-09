    (function () {
      const form = document.getElementById('conv-form');
      const submitBtn = document.getElementById('conv-submit');
      const successEl = document.getElementById('conv-success');

      form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const organizer_name = document.getElementById('organizer_name').value.trim();
        const email = document.getElementById('email').value.trim();
        const convention_name = document.getElementById('convention_name').value.trim();
        const event_date = document.getElementById('event_date').value.trim();
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
    })();

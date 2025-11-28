document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMsg = document.getElementById('login-error');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(loginForm);
            const data = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('http://localhost:3000/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', 
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (result.success) {
                    window.location.href = 'mainpage.html';
                } else {
                    errorMsg.textContent = result.message || 'Invalid credentials';
                    errorMsg.classList.remove('hidden');
                }
            } catch (err) {
                console.error(err);
                errorMsg.textContent = 'Server connection failed';
                errorMsg.classList.remove('hidden');
            }
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('http://localhost:3000/api/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
                window.location.href = 'index.html';
            } catch (err) {
                console.error(err);
            }
        });
    }
});
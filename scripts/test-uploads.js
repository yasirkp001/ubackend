async function test() {
    console.log('Testing Admin auth and profile updates...');
    
    // 1. Login
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@uclose.com', password: 'admin123' })
    });
    
    if (!loginRes.ok) {
        console.error('Login failed:', await loginRes.text());
        return;
    }
    
    const { token, user } = await loginRes.json();
    console.log('Logged in successfully. Token received.');
    console.log('Initial user details:', user);
    
    // 2. Update Profile
    const updateRes = await fetch('http://localhost:5000/api/auth/profile/update', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            name: 'MUHAMMED YASIR KP',
            phone: '+91 98765 43210',
            dp: 'http://localhost:5000/uploads/test.jpg'
        })
    });
    
    if (!updateRes.ok) {
        console.error('Update failed:', await updateRes.text());
        return;
    }
    
    console.log('Update API response:', await updateRes.json());
    
    // 3. Fetch /me
    const meRes = await fetch('http://localhost:5000/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!meRes.ok) {
        console.error('Fetch /me failed:', await meRes.text());
        return;
    }
    
    const meData = await meRes.json();
    console.log('Fetched /me user details:', meData.user);
    
    if (meData.user.name === 'MUHAMMED YASIR KP' && meData.user.dp === 'http://localhost:5000/uploads/test.jpg') {
        console.log('SUCCESS: Backend is working perfectly!');
    } else {
        console.error('FAIL: Backend did not update/return the settings.');
    }
}

test().catch(console.error);

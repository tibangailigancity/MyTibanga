'use client';

import { useState, useEffect } from 'react';

export function useAuth() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/auth/me')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data?.authenticated) setUser(data.user);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    return { user, loading };
}

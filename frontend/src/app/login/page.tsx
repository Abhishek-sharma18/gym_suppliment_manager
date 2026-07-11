'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { useLogin, useMe } from '@/lib/auth';
import { ApiClientError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const { data: me, isSuccess } = useMe();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isSuccess && me) router.replace('/');
  }, [isSuccess, me, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      router.replace('/');
    } catch {
      // surfaced via login.error below
    }
  };

  const errorMessage =
    login.error instanceof ApiClientError ? login.error.message : login.error ? 'Log in failed. Try again.' : null;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper sx={{ width: '100%', maxWidth: 380, p: 4 }} elevation={1}>
        <Stack spacing={2.5} component="form" onSubmit={handleSubmit}>
          <Box>
            <Typography variant="h5" component="h1">
              Gym Khata
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Log in to your account
            </Typography>
          </Box>

          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />
          <Button type="submit" variant="contained" size="large" disabled={login.isPending} fullWidth>
            {login.isPending ? 'Logging in…' : 'Log in'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

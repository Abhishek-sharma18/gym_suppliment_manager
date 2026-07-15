'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import { useMe, useLogout } from '@/lib/auth';
import { ApiClientError } from '@/lib/api';
import { useNotify } from './SnackbarProvider';

const DRAWER_WIDTH = 232;

type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <SpaceDashboardOutlinedIcon /> },
  { label: 'Sales', href: '/sales', icon: <PointOfSaleOutlinedIcon /> },
  { label: 'Production', href: '/production', icon: <PrecisionManufacturingOutlinedIcon /> },
  { label: 'Purchases', href: '/purchases', icon: <ShoppingCartOutlinedIcon /> },
  { label: 'Materials', href: '/materials', icon: <Inventory2OutlinedIcon /> },
  { label: 'Suppliers', href: '/suppliers', icon: <LocalShippingOutlinedIcon /> },
  { label: 'Products', href: '/products', icon: <CategoryOutlinedIcon /> },
  { label: 'Customers', href: '/customers', icon: <PeopleOutlinedIcon /> },
  { label: 'Expenses', href: '/expenses', icon: <PaymentsOutlinedIcon />, adminOnly: true },
  { label: 'Reports', href: '/reports', icon: <AssessmentOutlinedIcon /> },
  { label: 'Users', href: '/users', icon: <ManageAccountsOutlinedIcon />, adminOnly: true },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: me, isLoading, isError, error, refetch } = useMe();
  const logout = useLogout();
  const notify = useNotify();
  const [mobileOpen, setMobileOpen] = useState(false);

  const unauthenticated = error instanceof ApiClientError && error.status === 401;

  useEffect(() => {
    if (unauthenticated) router.replace('/login');
  }, [unauthenticated, router]);

  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => !item.adminOnly || me?.role === 'admin'),
    [me?.role],
  );

  const pageTitle = useMemo(
    () => navItems.find((item) => isActive(pathname, item.href))?.label ?? 'Gym Khata',
    [navItems, pathname],
  );

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError) {
    if (unauthenticated) return null;
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <Typography color="text.secondary">Can&apos;t reach the server.</Typography>
          <Button variant="outlined" onClick={() => refetch()}>
            Retry
          </Button>
        </Stack>
      </Box>
    );
  }

  if (!me) {
    return null;
  }

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      notify('Logout failed - try again', 'error');
    } finally {
      router.replace('/login');
    }
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 2, py: 2.5 }}>
        <Typography variant="h6" component="div">
          Gym Khata
        </Typography>
        <Typography variant="caption" color="text.secondary">
          inventory &amp; sales
        </Typography>
      </Box>
      <Divider />
      <List sx={{ flexGrow: 1, py: 1 }}>
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <ListItemButton
              key={item.href}
              selected={active}
              onClick={() => {
                router.push(item.href);
                setMobileOpen(false);
              }}
              sx={{
                mx: 1,
                borderRadius: 1,
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                  '&:hover': { backgroundColor: 'primary.dark' },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{ width: { md: `calc(100% - ${DRAWER_WIDTH}px)` }, ml: { md: `${DRAWER_WIDTH}px` } }}
      >
        <Toolbar sx={{ gap: 1.5 }}>
          <IconButton
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { xs: 'inline-flex', md: 'none' } }}
            aria-label="Open navigation"
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1 }}>
            {pageTitle}
          </Typography>
          <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
            {me.name}
          </Typography>
          <Chip
            label={me.role}
            size="small"
            variant={me.role === 'admin' ? 'outlined' : 'filled'}
            sx={
              me.role === 'admin'
                ? { borderColor: 'secondary.main', color: 'secondary.main' }
                : undefined
            }
          />
          <IconButton onClick={handleLogout} aria-label="Log out" disabled={logout.isPending}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          // A flex item's default min-width is `auto` (its content's min-content size), not 0 -
          // without this, any deeply nested non-wrapping content (a ToggleButtonGroup, a wide
          // table, ...) refuses to shrink below that intrinsic width and blows the WHOLE page out
          // horizontally instead of scrolling inside its own container. This is the fix for that.
          minWidth: 0,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Toolbar />
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>{children}</Box>
      </Box>
    </Box>
  );
}

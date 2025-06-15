
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { TrendingUp, LogIn } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

const loginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

const signupSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

const Auth = () => {
  const [isLoginView, setIsLoginView] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const from = location.state?.from?.pathname || '/dashboard';

  useEffect(() => {
    if (user) {
      navigate(from, { replace: true });
    }
  }, [user, navigate, from]);

  const formSchema = isLoginView ? loginSchema : signupSchema;
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    if (isLoginView) {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Logged in successfully!');
        navigate(from, { replace: true });
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: `${window.location.origin}${from}`,
        },
      });
      if (error) {
        toast.error(error.message);
      } else {
        toast.info('Check your email for the confirmation link!');
        form.reset();
      }
    }
    setLoading(false);
  };
  
  const cardVariants = {
    initial: { opacity: 0, y: 50, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -50, scale: 0.95 },
  };

  const toggleView = () => {
    setIsLoginView(!isLoginView);
    form.reset();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        <motion.div
            key={isLoginView ? 'login' : 'signup'}
            variants={cardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3, type: 'tween' }}
        >
            <Card className="w-full max-w-md mx-auto shadow-2xl border-0" style={{width: '400px'}}>
                <CardHeader className="text-center">
                    <div className="flex justify-center items-center space-x-3 mb-4 cursor-pointer" onClick={() => navigate('/')}>
                        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-green-500 flex items-center justify-center">
                            <TrendingUp className="w-7 h-7 text-white" />
                        </div>
                    </div>
                    <CardTitle className="text-3xl font-bold text-slate-900">{isLoginView ? 'Welcome Back' : 'Create Account'}</CardTitle>
                    <CardDescription className="text-slate-600">
                        {isLoginView ? 'Sign in to access your trading dashboard.' : 'Start your journey to disciplined trading.'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email</FormLabel>
                                        <FormControl>
                                            <Input placeholder="you@example.com" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="password"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Password</FormLabel>
                                        <FormControl>
                                            <Input type="password" placeholder="••••••••" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-green-500 hover:from-blue-700 hover:to-green-600" disabled={loading}>
                                <LogIn className="mr-2 h-4 w-4" />
                                {loading ? 'Processing...' : (isLoginView ? 'Sign In' : 'Sign Up')}
                            </Button>
                        </form>
                    </Form>
                    <div className="mt-6 text-center text-sm">
                        <span className="text-slate-600">
                            {isLoginView ? "Don't have an account?" : 'Already have an account?'}
                        </span>
                        <Button variant="link" className="pl-1" onClick={toggleView}>
                            {isLoginView ? 'Sign Up' : 'Sign In'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default Auth;

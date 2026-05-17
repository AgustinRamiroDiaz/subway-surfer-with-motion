import { render, screen } from '@testing-library/react';
import App from './App';

test('renders learn react link', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /live camera detection/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
});

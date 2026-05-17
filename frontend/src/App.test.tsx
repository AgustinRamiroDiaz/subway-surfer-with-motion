import { render, screen, within } from '@testing-library/react';
import App from './App';

jest.mock('./detectorWorkerClient', () => ({
  loadYoloDetectorWorker: jest.fn(),
}));

test('renders the motion game shell', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /motion runner/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/main game/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/camera feedback/i)).toBeInTheDocument();
  expect(within(screen.getByLabelText(/game controls/i)).getByRole('button', { name: /start/i })).toBeEnabled();
  expect(within(screen.getByLabelText(/game controls/i)).getByRole('button', { name: /pause/i })).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /mirror camera/i })).toBeChecked();
  expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
});

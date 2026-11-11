// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Modal, Progress, Tabs, Markdown, Field } from './ui';

describe('ui primitives', () => {
  it('renders buttons with variants and forwards clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" size="sm" onClick={onClick}>
        Save changes
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save changes' });
    expect(button).toHaveClass('btn-primary');
    expect(button).toHaveClass('text-xs');
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exposes progress semantics', () => {
    render(<Progress value={42} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('switches tabs and marks the active tab', async () => {
    const onChange = vi.fn();
    render(
      <Tabs
        value="active"
        onChange={onChange}
        tabs={[
          { id: 'active', label: 'Active', count: 2 },
          { id: 'done', label: 'Completed' },
        ]}
      />,
    );
    expect(screen.getByRole('tab', { name: /Active/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Completed/ })).toHaveAttribute('aria-selected', 'false');
    await userEvent.click(screen.getByRole('tab', { name: /Completed/ }));
    expect(onChange).toHaveBeenCalledWith('done');
  });

  it('links labels to fields', () => {
    render(
      <Field label="Character name" hint="Stored locally">
        <input defaultValue="Aria" />
      </Field>,
    );
    expect(screen.getByRole('textbox', { name: /Character name/ })).toHaveValue('Aria');
    expect(screen.getByText('Stored locally')).toBeInTheDocument();
  });

  it('renders sanitized markdown', () => {
    render(<Markdown>{'# Title\n\n- one\n- two\n\n<script>alert(1)</script>'}</Markdown>);
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(document.querySelector('script')).toBeNull();
  });

  it('closes a modal with Escape and the backdrop', async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Confirm action">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Confirm action' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when a modal is closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

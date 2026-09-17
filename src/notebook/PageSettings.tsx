import type { Page } from "../store/model";
import { IconButton } from "../shell/IconButton";
import { Popover } from "../shell/Popover";
import { PageSettings as PageIcon } from "../shell/icons";
import "./pagesettings.css";

export interface PageSettingsProps {
  page: Page;
  number: number;
  count: number;
  twoColumns: boolean;
  onTwoColumnsChange: (enabled: boolean) => void;
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

/** The page's metadata and its own settings, in a popover from the app bar. */
export function PageSettings({
  page,
  number,
  count,
  twoColumns,
  onTwoColumnsChange,
}: PageSettingsProps) {
  return (
    <Popover
      trigger={({ open, toggle, controls }) => (
        <IconButton
          label="Page settings"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={controls}
        >
          <PageIcon />
        </IconButton>
      )}
    >
      <div className="page-settings">
        <div className="page-settings__meta">
          <div>
            Page {number} of {count}
          </div>
          <div>{formatDate(page.createdAt)}</div>
        </div>
        <label className="page-settings__row">
          <input
            type="checkbox"
            checked={twoColumns}
            onChange={(event) => onTwoColumnsChange(event.target.checked)}
          />
          Two columns
        </label>
      </div>
    </Popover>
  );
}

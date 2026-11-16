CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY categories_slug_unique (slug)
);

INSERT IGNORE INTO categories (name, slug) VALUES
  ('Featured', 'featured'),
  ('Pantry staples', 'pantry-staples'),
  ('Rice, pasta & grains', 'rice-pasta-grains'),
  ('Canned & jarred foods', 'canned-jarred-foods'),
  ('Sauces & condiments', 'sauces-condiments'),
  ('Dairy & eggs', 'dairy-eggs'),
  ('Bakery', 'bakery'),
  ('Meat & seafood', 'meat-seafood'),
  ('Beverages', 'beverages'),
  ('Frozen foods', 'frozen-foods'),
  ('Snacks & confectionery', 'snacks-confectionery'),
  ('Household cleaning', 'household-cleaning'),
  ('Laundry', 'laundry'),
  ('Personal care', 'personal-care'),
  ('Baby care', 'baby-care'),
  ('Pet care', 'pet-care');

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'catalog_manager', 'order_manager') NOT NULL DEFAULT 'catalog_manager',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY admin_users_email_unique (email)
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NULL,
  first_name VARCHAR(80) NULL,
  last_name VARCHAR(80) NULL,
  phone VARCHAR(32) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY customers_email_unique (email)
);

CREATE TABLE IF NOT EXISTS delivery_addresses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT UNSIGNED NULL,
  label VARCHAR(50) NULL,
  recipient_name VARCHAR(160) NULL,
  address_line VARCHAR(500) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX delivery_addresses_customer_idx (customer_id),
  CONSTRAINT delivery_addresses_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT delivery_addresses_latitude_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT delivery_addresses_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS grocery (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  old_price DECIMAL(10,2) NULL,
  discount DECIMAL(5,2) NOT NULL DEFAULT 0,
  offer VARCHAR(160) NULL,
  unit VARCHAR(80) NOT NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  emoji VARCHAR(16) DEFAULT '📦',
  image_url VARCHAR(500) NULL,
  image_data LONGBLOB NULL,
  image_mime_type VARCHAR(100) NULL,
  offer_ends_at DATETIME NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX products_active_category_idx (is_active, category),
  CONSTRAINT products_price_check CHECK (price >= 0),
  CONSTRAINT products_discount_check CHECK (discount BETWEEN 0 AND 100)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT UNSIGNED NULL,
  delivery_address_id BIGINT UNSIGNED NULL,
  status ENUM('awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'awaiting_payment',
  currency CHAR(3) NOT NULL DEFAULT 'NZD',
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  delivery_address VARCHAR(500) NOT NULL,
  delivery_latitude DECIMAL(10,7) NULL,
  delivery_longitude DECIMAL(10,7) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX orders_status_created_idx (status, created_at),
  INDEX orders_customer_created_idx (customer_id, created_at),
  CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT orders_delivery_address_fk FOREIGN KEY (delivery_address_id) REFERENCES delivery_addresses(id) ON DELETE SET NULL,
  CONSTRAINT orders_latitude_check CHECK (delivery_latitude IS NULL OR delivery_latitude BETWEEN -90 AND 90),
  CONSTRAINT orders_longitude_check CHECK (delivery_longitude IS NULL OR delivery_longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  product_name VARCHAR(160) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX order_items_order_idx (order_id),
  CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES grocery(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(40) NULL,
  provider_payment_id VARCHAR(255) NULL,
  status ENUM('pending', 'authorized', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NZD',
  failure_reason VARCHAR(255) NULL,
  paid_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY payments_provider_id_unique (provider, provider_payment_id),
  INDEX payments_order_idx (order_id),
  CONSTRAINT payments_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT payments_amount_check CHECK (amount >= 0)
);

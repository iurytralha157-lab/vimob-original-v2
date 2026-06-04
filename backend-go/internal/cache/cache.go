package cache

import (
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/tidwall/buntdb"
)

type Cache struct {
	db *buntdb.DB
}

func Open(path string) (*Cache, error) {
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return nil, err
		}
	}
	db, err := buntdb.Open(path)
	if err != nil {
		return nil, err
	}
	return &Cache{db: db}, nil
}

func (c *Cache) Close() error {
	return c.db.Close()
}

func (c *Cache) Set(key, value string, ttl time.Duration) error {
	return c.db.Update(func(tx *buntdb.Tx) error {
		options := &buntdb.SetOptions{}
		if ttl > 0 {
			options.Expires = true
			options.TTL = ttl
		}
		_, _, err := tx.Set(key, value, options)
		return err
	})
}

func (c *Cache) Get(key string) (string, bool, error) {
	var value string
	err := c.db.View(func(tx *buntdb.Tx) error {
		v, err := tx.Get(key)
		if err != nil {
			return err
		}
		value = v
		return nil
	})
	if errors.Is(err, buntdb.ErrNotFound) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return value, true, nil
}

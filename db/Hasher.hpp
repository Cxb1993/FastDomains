#ifndef Hasher_INCLUDE_ONCE
#define Hasher_INCLUDE_ONCE

#include "smhasher/src/Hashes.h"

typedef quint64 HashType;

class Hasher
{
  // Lower this if you need to limit the amount of data allocated to the stack, for example to 16K.
  static const int CHUNK_SIZE = 128*1024;

public:
  //! Constructor.
  Hasher() { crc32_init(); }

  HashType compute(const void* buf, int len ) {
    return compute_md5( buf, len );
  }

private:

  HashType compute_crc32(const void* buf, int length)
  {
    qint32 res = 0;
    crc32(buf, length, 0xFFFFFFFF, &res);
    return res;
  }

  HashType compute_crc32a(const void* buf, int length)
  {
    qint32 res = 0;
    crc32(buf, length, 0xFFFFFFFF, &res);
    // res = ((res >> 16) & 0x0000FFFF) | ((res << 16) & 0xFFFF0000);
    res += 1;
    return res;
  }

  HashType compute_x32(const void* buf, int length)
  {
    const unsigned char* buffer = (const unsigned char*)buf;
    quint32 hash = 0;
    while(length--)
      hash = hash * 111 + *buffer++;
    return hash;
  }

  HashType compute_x64(const void* buf, int length)
  {
    const unsigned char* buffer = (const unsigned char*)buf;
    quint64 hash = 0;
    while(length--)
      hash = hash * 111 + *buffer++;
    return hash;
  }

  HashType compute_m32(const void* buf, int length)
  {
    quint32 crc32 = 0;
    MurmurHash3_x86_32( buf, length, 0xFFFFFFFF, &crc32);
    return crc32;
  }

  HashType compute_m64(const void* buf, int length)
  {
    char hash[16];
    MurmurHash3_x64_128( buf, length, 0xFFFFFFFF, hash);
    return *(quint64*)hash;
  }

  HashType compute_md5(const void* buf, int length)
  {
    quint64 hash = 0;
    md5_64(buf, length, 0xFFFFFFFF, &hash);
    return hash;
  }

  HashType compute_sha1(const void* buf, int length)
  {
    quint64 hash = 0;
    sha1_64a( buf, length, 0xFFFFFFFF, &hash);
    return hash;
  }

protected:
  void crc32_init()
  {
    unsigned int ulPolynomial = 0x04c11db7;
    for(int i = 0; i <= 0xFF; i++)
    {
      crc32_table[i]=reflect(i, 8) << 24;
      for (int j = 0; j < 8; j++)
        crc32_table[i] = (crc32_table[i] << 1) ^ (crc32_table[i] & (1 << 31) ? ulPolynomial : 0);
      crc32_table[i] = reflect(crc32_table[i], 32);
    }
  }

  unsigned int reflect(unsigned int val, char ch)
  {
    unsigned int refl = 0;
    for(int i = 1; i < (ch + 1); i++)
    {
      if(val & 1)
        refl |= 1 << (ch - i);
      val >>= 1;
    }
    return refl;
  }

protected:
  unsigned int crc32_table[256];
};

#endif

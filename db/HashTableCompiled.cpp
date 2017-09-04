#include "HashTableCompiled.hpp"
#include "IdeaDictionary.hpp"

QRegExp gDomainRegex("^[A-Z0-9][A-Z0-9-]{1,61}[A-Z0-9]$");

std::vector< size_t > gIdeaDictionarySize;

class Idea {
public:
  Idea() {
    memset(mDomain, 0, 128);
    mIdeaIndex = 0;
    mIdeaLen = 0;
  }

  char mDomain[128];
  size_t mIdeaIndex;
  size_t mIdeaLen;

  void prefix(const char* topic, size_t topic_size, size_t idea) {
    memcpy( mDomain, topic, topic_size );
    memcpy( mDomain + topic_size, gIdeaDictionary[idea], gIdeaDictionarySize[idea] + 1 );
    mIdeaLen = topic_size + gIdeaDictionarySize[idea];
  }

  void postfix(const char* topic, size_t topic_size, size_t idea) {
    memcpy( mDomain, gIdeaDictionary[idea], gIdeaDictionarySize[idea]);
    memcpy( mDomain + gIdeaDictionarySize[idea], topic, topic_size + 1 );
    mIdeaLen = topic_size + gIdeaDictionarySize[idea];
  }
};

bool AlphaAscSorter(const Idea& a, const Idea& b) {
  return strcmp( a.mDomain, b.mDomain ) < 0;
}

bool AlphaDescSorter(const Idea& a, const Idea& b) {
  return strcmp( b.mDomain, a.mDomain ) < 0;
}

bool LenAscSorter(const Idea& a, const Idea& b) {
  if ( a.mIdeaLen != b.mIdeaLen)
    return a.mIdeaLen < b.mIdeaLen;
  else
    return AlphaAscSorter( a, b );
}

bool LenDescSorter(const Idea& a, const Idea& b) {
  if ( a.mIdeaLen != b.mIdeaLen)
    return b.mIdeaLen < a.mIdeaLen;
  else
    return AlphaAscSorter( a, b );
}

bool PopularitySorter(const Idea& a, const Idea& b) {
  size_t popa = a.mIdeaIndex < DICTIONARY_POST ? a.mIdeaIndex : a.mIdeaIndex - DICTIONARY_POST;
  size_t popb = b.mIdeaIndex < DICTIONARY_POST ? b.mIdeaIndex : b.mIdeaIndex - DICTIONARY_POST;
  return popa < popb;
}

std::vector<Idea> mIdeas;

void HashTableCompiled::command( const QString& topic, const QString& sorting ) {
  // test the domains and compile reply list
  mCommandDomains = QJsonArray();

  if ( topic == "@3" ) {
    while( mCommandDomains.size() < 100 ) {
      char word[] = {
        char('A' + rand() % 26),
        char('A' + rand() % 26),
        char('A' + rand() % 26),
        0
      };
      HashType hash = mHasher.compute( word, 3 );
      if ( ! get( hash ) ) {
        mCommandDomains.push_back( QString( word ) );
      }
    }
  } else
  if ( topic == "@4" ) {
    while( mCommandDomains.size() < 100 ) {
      char word[] = {
        char('A' + rand() % 26),
        char('A' + rand() % 26),
        char('A' + rand() % 26),
        char('A' + rand() % 26),
        0
      };
      HashType hash = mHasher.compute( word, 4 );
      if ( ! get( hash ) ) {
        mCommandDomains.push_back( QString( word ) );
      }
    }
  }
}

void HashTableCompiled::ideas( const char* topic, const QString& filter, const QString& sorting ) {
  mIdeas.reserve(DICTIONARY_SIZE);
  mIdeas.resize(0);
  if ( gIdeaDictionarySize.empty() ) {
    gIdeaDictionarySize.resize(DICTIONARY_SIZE);
    for( size_t i = 0; i < gIdeaDictionarySize.size(); ++i ) {
      gIdeaDictionarySize[ i ] = strlen( gIdeaDictionary[ i ] );
    }
  }

  size_t topic_size = strlen( topic );

  // generate the domains - filtered
  int pre_end = DICTIONARY_POST;
  int count = 0;
  if ( ( filter == "pre" || filter == "pre-post" ) && gDomainRegex.indexIn( QString(topic) + "SOME-VERY-LONG-IDEA" ) != -1 ) {
    for( size_t i = 0; i < pre_end; ++i ) {
      mIdeas.resize(++count);
      mIdeas.back().prefix(topic, topic_size, i);
      mIdeas.back().mIdeaIndex = i;
    }
  }
  if ( ( filter == "post" || filter == "pre-post" ) && gDomainRegex.indexIn( QString("SOME-VERY-LONG-IDEA") + topic ) != -1 ) {
    for( size_t i = pre_end; i < DICTIONARY_SIZE; ++i ) {
      mIdeas.resize(++count);
      mIdeas.back().postfix(topic, topic_size, i);
      mIdeas.back().mIdeaIndex = i;
    }
  }

  // sort the domains
  if ( sorting == "len-asc") {
    std::stable_sort(mIdeas.begin(), mIdeas.end(), LenAscSorter);
  }
  else
  if ( sorting == "len-desc") {
    std::stable_sort(mIdeas.begin(), mIdeas.end(), LenDescSorter);
  }
  else
  if ( sorting == "alpha-asc") {
    std::stable_sort(mIdeas.begin(), mIdeas.end(), AlphaAscSorter);
  }
  else
  if ( sorting == "alpha-desc") {
    std::stable_sort(mIdeas.begin(), mIdeas.end(), AlphaDescSorter);
  }
  else
  if ( sorting == "random") {
    std::random_shuffle(mIdeas.begin(), mIdeas.end());
  }
  else
  if ( sorting == "popularity") {
    // do nothing
    std::stable_sort(mIdeas.begin(), mIdeas.end(), PopularitySorter);
  }

  // test the domains and compile reply list
  mIdeasIndex = QJsonArray();
  for( size_t i = 0; i < mIdeas.size() && mIdeasIndex.size() < 5000; ++i ) {
    HashType hash = mHasher.compute( mIdeas[i].mDomain, (int)mIdeas[i].mIdeaLen );
    if ( ! get( hash ) ) {
      mIdeasIndex.push_back( (int)mIdeas[i].mIdeaIndex );
    }
  }
}

void HashTableCompiled::query(const QJsonArray& domains) {
  mQueryAvailability = QJsonArray();
  HashType hash = 0;
  for( QJsonArray::const_iterator it = domains.begin(); it != domains.end(); ++it ) {
    QString domain( it->toString().toUpper() );
    hash = mHasher.compute( CSTR(domain), domain.length() );
    bool available = gDomainRegex.indexIn( domain ) != -1 && ! get( hash );
    mQueryAvailability.push_back( available );
  }
}

bool HashTableCompiled::isAvailable( const QString& domain ) {
  return gDomainRegex.indexIn( domain ) != -1 && ! get( mHasher.compute( CSTR(domain), domain.length() ) );
}

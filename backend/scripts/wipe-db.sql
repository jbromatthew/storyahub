-- storyahub DB 전체 초기화 (public 스키마의 모든 테이블·타입 삭제)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
